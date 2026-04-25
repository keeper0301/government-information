"use client";

// ============================================================
// RichEditor — 워드프레스 클래식 에디터 스타일 본문 편집기 (풀 기능)
// ============================================================
// TipTap 기반. 사장님이 raw HTML 안 보고 비주얼로 글 편집할 수 있게.
//
// 입출력: HTML 문자열 (기존 blog_posts.content 와 그대로 호환).
// initial 로 받은 HTML 을 set, 변경마다 hidden <input name="content"> 동기화 →
// 부모 server action form 이 그대로 작동.
//
// 툴바 그룹:
//   본문 스타일: 단락 / H2 / H3 / 인용
//   강조: 굵게 / 기울임 / 밑줄 / 취소선 / 인라인 코드
//   색상: 글자색 / 하이라이트 (각각 dropdown 팔레트)
//   정렬: 왼쪽 / 가운데 / 오른쪽
//   목록: 글머리 / 번호 / 체크리스트
//   링크: 추가 / 제거
//   미디어: 표 / 이미지 / 유튜브
//   블록: 수평선 / 코드블록
//   실행 취소 / 다시 실행
//   HTML 보기 토글
//
// 보안: /blog/[slug] 가 dangerouslySetInnerHTML 로 본문 렌더하므로
// lib/html-sanitize.ts 에서 mark / u / span style / input task / iframe youtube
// 까지 화이트리스트 확장 필요.
// ============================================================

import {
  useEditor,
  EditorContent,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Underline } from "@tiptap/extension-underline";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Youtube } from "@tiptap/extension-youtube";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { useEffect, useRef, useState } from "react";

type Props = {
  initialHtml: string;
  // form submit 시 함께 전송될 hidden input 의 name (기본 "content")
  name?: string;
};

// 글자색 팔레트 — null = unset(기본). 워드프레스 핵심 색상 8개.
const TEXT_COLORS: { color: string | null; label: string }[] = [
  { color: null, label: "기본" },
  { color: "#111111", label: "검정" },
  { color: "#6b7280", label: "회색" },
  { color: "#dc2626", label: "빨강" },
  { color: "#ea580c", label: "주황" },
  { color: "#16a34a", label: "초록" },
  { color: "#2563eb", label: "파랑" },
  { color: "#9333ea", label: "보라" },
];

// 하이라이트(형광펜) 팔레트 — 파스텔 톤 (본문 위 강조용).
const HIGHLIGHT_COLORS: { color: string | null; label: string }[] = [
  { color: null, label: "끄기" },
  { color: "#fef08a", label: "노랑" },
  { color: "#bbf7d0", label: "연두" },
  { color: "#fbcfe8", label: "분홍" },
  { color: "#bae6fd", label: "하늘" },
  { color: "#ddd6fe", label: "라벤더" },
];

export function RichEditor({ initialHtml, name = "content" }: Props) {
  // form submit 호환용 hidden input — editor 변경마다 value 동기화.
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlBuffer, setHtmlBuffer] = useState(initialHtml);
  const [linkModal, setLinkModal] = useState<{ open: boolean; initial: string }>({
    open: false,
    initial: "",
  });
  const [imageModal, setImageModal] = useState(false);
  const [youtubeModal, setYoutubeModal] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 코드 블록은 별도 클래스, 인라인 code 는 starter-kit 기본 그대로
        codeBlock: { HTMLAttributes: { class: "rich-codeblock" } },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: { class: "rich-img" },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Underline,
      // multicolor: true 로 색상별 hex 보존 (default 는 1색만 토글).
      Highlight.configure({ multicolor: true }),
      // heading + paragraph 만 정렬 적용 (목록 정렬은 워드프레스에도 안 흔함).
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // Color 는 TextStyle mark 에 의존 — 둘 다 등록해야 글자색 동작.
      TextStyle,
      Color,
      // YouTube 임베드 — controls/allowFullscreen 기본 ON.
      Youtube.configure({
        controls: true,
        nocookie: true, // 쿠키 없는 youtube-nocookie.com 사용 (개인정보)
        HTMLAttributes: { class: "rich-youtube" },
      }),
      TaskList,
      // 중첩 가능 (체크박스 안에 또 체크박스).
      TaskItem.configure({ nested: true }),
    ],
    content: initialHtml,
    immediatelyRender: false, // SSR hydration 안전
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[480px] px-4 py-4 focus:outline-none rich-editor-content",
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      setHtmlBuffer(html);
      if (hiddenRef.current) hiddenRef.current.value = html;
    },
  });

  // showHtml 토글: HTML 모드 → 비주얼 모드 전환 시 textarea 변경분을 editor 에 반영.
  useEffect(() => {
    if (!editor) return;
    if (!showHtml) {
      // HTML 모드에서 돌아왔을 때 buffer 가 editor 와 다르면 set
      if (htmlBuffer !== editor.getHTML()) {
        editor.commands.setContent(htmlBuffer);
      }
    }
  }, [showHtml, editor, htmlBuffer]);

  if (!editor) {
    return (
      <div className="border border-grey-300 rounded-lg p-4 text-[13px] text-grey-500">
        에디터 불러오는 중...
      </div>
    );
  }

  return (
    <div className="border border-grey-300 rounded-lg overflow-hidden bg-white">
      {/* 툴바 — 워드프레스 클래식 에디터 패턴 */}
      <Toolbar
        editor={editor}
        showHtml={showHtml}
        onToggleHtml={() => setShowHtml((v) => !v)}
        onOpenLinkModal={() => {
          const previous = (editor.getAttributes("link").href as string) ?? "";
          setLinkModal({ open: true, initial: previous });
        }}
        onOpenImageModal={() => setImageModal(true)}
        onOpenYoutubeModal={() => setYoutubeModal(true)}
      />

      {/* 본문 영역 — 비주얼 모드 / HTML 모드 토글 */}
      {showHtml ? (
        <textarea
          value={htmlBuffer}
          onChange={(e) => {
            setHtmlBuffer(e.target.value);
            if (hiddenRef.current) hiddenRef.current.value = e.target.value;
          }}
          rows={28}
          className="w-full px-4 py-4 text-[13px] font-mono border-0 focus:outline-none leading-[1.6] resize-y"
          style={{ tabSize: 2 }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* form 호환 hidden input — name="content" 그대로 server action 에 들어감.
          editor 변경마다 hiddenRef.current.value 동기화 (onUpdate). */}
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={initialHtml} />
      {/* 스타일은 app/globals.css 의 .rich-editor-content scope 에 있음 */}

      {/* 링크 모달 */}
      {linkModal.open && (
        <LinkModal
          initial={linkModal.initial}
          onCancel={() => setLinkModal({ open: false, initial: "" })}
          onSubmit={(url) => {
            if (url === "") {
              editor.chain().focus().unsetLink().run();
            } else {
              editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }
            setLinkModal({ open: false, initial: "" });
          }}
        />
      )}

      {/* 이미지 업로드 모달 */}
      {imageModal && (
        <ImageModal
          onCancel={() => setImageModal(false)}
          onInsert={(url) => {
            editor.chain().focus().setImage({ src: url }).run();
            setImageModal(false);
          }}
        />
      )}

      {/* 유튜브 임베드 모달 */}
      {youtubeModal && (
        <YouTubeModal
          onCancel={() => setYoutubeModal(false)}
          onInsert={(url) => {
            editor.chain().focus().setYoutubeVideo({ src: url }).run();
            setYoutubeModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────
function Toolbar({
  editor,
  showHtml,
  onToggleHtml,
  onOpenLinkModal,
  onOpenImageModal,
  onOpenYoutubeModal,
}: {
  editor: Editor;
  showHtml: boolean;
  onToggleHtml: () => void;
  onOpenLinkModal: () => void;
  onOpenImageModal: () => void;
  onOpenYoutubeModal: () => void;
}) {
  // useEditorState: selection·transaction 마다 selector 재실행 → React 리렌더.
  // 이게 없으면 isActive 결과가 stale 하게 stuck (커서 이동에 반응 X).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      return {
        isParagraph: e.isActive("paragraph"),
        isH2: e.isActive("heading", { level: 2 }),
        isH3: e.isActive("heading", { level: 3 }),
        isBlockquote: e.isActive("blockquote"),
        isBold: e.isActive("bold"),
        isItalic: e.isActive("italic"),
        isUnderline: e.isActive("underline"),
        isStrike: e.isActive("strike"),
        isInlineCode: e.isActive("code"),
        isBulletList: e.isActive("bulletList"),
        isOrderedList: e.isActive("orderedList"),
        isTaskList: e.isActive("taskList"),
        isLink: e.isActive("link"),
        isCodeBlock: e.isActive("codeBlock"),
        isTable: e.isActive("table"),
        // 정렬은 active 자체보단 현재 attr 가 어떤지 비교
        isAlignLeft: e.isActive({ textAlign: "left" }) || (!e.isActive({ textAlign: "center" }) && !e.isActive({ textAlign: "right" })),
        isAlignCenter: e.isActive({ textAlign: "center" }),
        isAlignRight: e.isActive({ textAlign: "right" }),
        // 현재 선택 영역의 글자색·하이라이트색 (없으면 null)
        currentColor: (e.getAttributes("textStyle").color as string) ?? null,
        currentHighlight: (e.getAttributes("highlight").color as string) ?? null,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  if (!state) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-grey-200 bg-grey-50">
      {/* ━━━ 본문 스타일 ━━━ */}
      <Btn
        active={state.isParagraph}
        onClick={() => editor.chain().focus().setParagraph().run()}
        title="단락"
        disabled={showHtml}
      >
        P
      </Btn>
      <Btn
        active={state.isH2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="대제목 (H2)"
        disabled={showHtml}
      >
        H2
      </Btn>
      <Btn
        active={state.isH3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="중제목 (H3)"
        disabled={showHtml}
      >
        H3
      </Btn>
      <Btn
        active={state.isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="인용"
        disabled={showHtml}
      >
        ❝ 인용
      </Btn>

      <Sep />

      {/* ━━━ 강조 ━━━ */}
      <Btn
        active={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="굵게 (Ctrl+B)"
        disabled={showHtml}
      >
        <b>B</b>
      </Btn>
      <Btn
        active={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
        disabled={showHtml}
      >
        <i>I</i>
      </Btn>
      <Btn
        active={state.isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="밑줄 (Ctrl+U)"
        disabled={showHtml}
      >
        <u>U</u>
      </Btn>
      <Btn
        active={state.isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="취소선"
        disabled={showHtml}
      >
        <s>S</s>
      </Btn>
      <Btn
        active={state.isInlineCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="인라인 코드"
        disabled={showHtml}
      >
        {"<>"}
      </Btn>

      <Sep />

      {/* ━━━ 색상 (글자색·하이라이트 dropdown) ━━━ */}
      <ColorDropdown
        label="🎨"
        title="글자색"
        currentColor={state.currentColor}
        palette={TEXT_COLORS}
        disabled={showHtml}
        onPick={(color) => {
          if (color === null) editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(color).run();
        }}
      />
      <ColorDropdown
        label="🖍"
        title="하이라이트"
        currentColor={state.currentHighlight}
        palette={HIGHLIGHT_COLORS}
        disabled={showHtml}
        onPick={(color) => {
          if (color === null) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().setHighlight({ color }).run();
        }}
      />

      <Sep />

      {/* ━━━ 정렬 ━━━ */}
      <Btn
        active={state.isAlignLeft && !state.isAlignCenter && !state.isAlignRight}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        title="왼쪽 정렬"
        disabled={showHtml}
      >
        ⬅
      </Btn>
      <Btn
        active={state.isAlignCenter}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        title="가운데 정렬"
        disabled={showHtml}
      >
        ↔
      </Btn>
      <Btn
        active={state.isAlignRight}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        title="오른쪽 정렬"
        disabled={showHtml}
      >
        ➡
      </Btn>

      <Sep />

      {/* ━━━ 목록 ━━━ */}
      <Btn
        active={state.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="글머리 목록"
        disabled={showHtml}
      >
        • 목록
      </Btn>
      <Btn
        active={state.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="번호 목록"
        disabled={showHtml}
      >
        1. 목록
      </Btn>
      <Btn
        active={state.isTaskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="체크리스트"
        disabled={showHtml}
      >
        ☑ 체크
      </Btn>

      <Sep />

      {/* ━━━ 링크 ━━━ */}
      <Btn
        active={state.isLink}
        onClick={onOpenLinkModal}
        title="링크"
        disabled={showHtml}
      >
        🔗 링크
      </Btn>
      {state.isLink && (
        <Btn
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="링크 제거"
          disabled={showHtml}
        >
          ✕ 링크
        </Btn>
      )}

      <Sep />

      {/* ━━━ 미디어 ━━━ */}
      <Btn
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="3×3 표 삽입"
        disabled={showHtml}
      >
        ⊞ 표
      </Btn>
      {state.isTable && (
        <>
          <Btn
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="열 추가"
            disabled={showHtml}
          >
            +열
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="행 추가"
            disabled={showHtml}
          >
            +행
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="표 삭제"
            disabled={showHtml}
          >
            ✕ 표
          </Btn>
        </>
      )}
      <Btn
        onClick={onOpenImageModal}
        title="이미지 업로드 또는 URL"
        disabled={showHtml}
      >
        🖼 이미지
      </Btn>
      <Btn
        onClick={onOpenYoutubeModal}
        title="유튜브 영상 임베드"
        disabled={showHtml}
      >
        ▶ 유튜브
      </Btn>

      <Sep />

      {/* ━━━ 블록 ━━━ */}
      <Btn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="수평선"
        disabled={showHtml}
      >
        ─ 선
      </Btn>
      <Btn
        active={state.isCodeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="코드 블록"
        disabled={showHtml}
      >
        {"</>"}
      </Btn>

      <Sep />

      {/* ━━━ 실행 취소 / 다시 ━━━ */}
      <Btn
        onClick={() => editor.chain().focus().undo().run()}
        title="실행 취소 (Ctrl+Z)"
        disabled={showHtml || !state.canUndo}
      >
        ↶
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().redo().run()}
        title="다시 실행 (Ctrl+Y)"
        disabled={showHtml || !state.canRedo}
      >
        ↷
      </Btn>

      {/* 우측 끝: HTML 모드 토글 */}
      <div className="ml-auto">
        <Btn
          active={showHtml}
          onClick={onToggleHtml}
          title="HTML 원본 보기·편집"
        >
          {showHtml ? "비주얼" : "HTML"}
        </Btn>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  active,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`min-h-[32px] px-2.5 text-[13px] font-medium rounded border cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-grey-900 text-white border-grey-900"
          : "bg-white text-grey-800 border-grey-300 hover:bg-grey-100"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-grey-300 inline-block" aria-hidden />;
}

// ─────────────────────────────────────────────────────────────
// ColorDropdown — 글자색·하이라이트 공용 팔레트 popover
// ─────────────────────────────────────────────────────────────
// 작은 버튼 클릭 시 색상 그리드 popover 노출. 팔레트 항목 클릭 → onPick(color).
// 바깥 클릭 또는 Esc 로 닫힘. 현재 색은 active 표시.
// ─────────────────────────────────────────────────────────────
function ColorDropdown({
  label,
  title,
  currentColor,
  palette,
  disabled,
  onPick,
}: {
  label: string;
  title: string;
  currentColor: string | null;
  palette: { color: string | null; label: string }[];
  disabled?: boolean;
  onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 + Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 현재 색이 팔레트에 있으면 active 인덱스로 표시
  const activeIdx = palette.findIndex((p) => p.color === currentColor);

  return (
    <div className="relative" ref={ref}>
      <Btn
        active={open}
        onClick={() => setOpen((v) => !v)}
        title={title}
        disabled={disabled}
      >
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>{label}</span>
          {currentColor && (
            <span
              className="inline-block w-3 h-3 rounded-sm border border-grey-300"
              style={{ background: currentColor }}
              aria-hidden
            />
          )}
        </span>
      </Btn>
      {open && (
        <div
          role="listbox"
          aria-label={title}
          className="absolute top-full left-0 mt-1 z-30 bg-white border border-grey-300 rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1 w-[180px]"
        >
          {palette.map((p, idx) => (
            <button
              key={p.label}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onClick={() => {
                onPick(p.color);
                setOpen(false);
              }}
              title={p.label}
              className={`relative h-8 rounded border text-[11px] font-medium transition-colors ${
                idx === activeIdx
                  ? "border-grey-900 ring-1 ring-grey-900"
                  : "border-grey-200 hover:border-grey-400"
              }`}
              style={{
                background: p.color ?? "#ffffff",
                color: p.color === null ? "#374151" : isLightColor(p.color) ? "#111111" : "#ffffff",
              }}
            >
              {p.color === null ? p.label : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 단순 luminance 추정 — 팔레트 항목 라벨이 거의 안 보이지만 unset 셀(배경색 없음)
// 텍스트 색상 결정용. #rrggbb 6자리 hex 만 처리.
function isLightColor(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return true;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  // ITU-R BT.601 luminance approx
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

// ─────────────────────────────────────────────────────────────
// 링크 모달 — URL 입력 + 적용·제거
// ─────────────────────────────────────────────────────────────
function LinkModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initial || "https://");
  return (
    <ModalShell title="링크" onCancel={onCancel}>
      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-semibold text-grey-700 mb-1.5">
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            className="w-full h-11 px-3 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <p className="mt-1 text-[12px] text-grey-500">
            비워두고 적용하면 기존 링크가 제거됩니다.
          </p>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[14px] font-medium text-grey-700 border border-grey-300 rounded-lg hover:bg-grey-50 cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit(url.trim() === "https://" ? "" : url.trim())}
            className="px-4 py-2 text-[14px] font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 cursor-pointer"
          >
            적용
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 이미지 모달 — 파일 업로드 또는 URL 직접 입력
// ─────────────────────────────────────────────────────────────
function ImageModal({
  onCancel,
  onInsert,
}: {
  onCancel: () => void;
  onInsert: (url: string) => void;
}) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [externalUrl, setExternalUrl] = useState("https://");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("5MB 이하 파일만 업로드 가능합니다");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `업로드 실패 (HTTP ${res.status})`);
      } else {
        onInsert(data.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ModalShell title="이미지 삽입" onCancel={onCancel}>
      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-grey-200">
        {(
          [
            { key: "upload", label: "파일 업로드" },
            { key: "url", label: "URL 입력" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[14px] font-semibold border-b-2 cursor-pointer ${
              tab === t.key
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-grey-600 hover:text-grey-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "upload" ? (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-[13px] text-grey-700
              file:mr-3 file:px-4 file:py-2 file:border-0 file:rounded-lg
              file:bg-blue-500 file:text-white file:font-semibold
              file:cursor-pointer file:hover:bg-blue-600
              disabled:opacity-50"
          />
          <p className="text-[12px] text-grey-500">
            JPEG / PNG / WebP / GIF, 최대 5MB. 업로드 즉시 본문에 삽입됩니다.
          </p>
          {uploading && (
            <p className="text-[13px] text-blue-600">업로드 중...</p>
          )}
          {error && (
            <p className="text-[13px] text-red-600">⚠ {error}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-grey-700 mb-1.5">
              이미지 URL
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
              className="w-full h-11 px-3 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-[12px] text-grey-500">
              외부 호스팅 이미지의 직접 링크 (https://). korea.kr 썸네일·imgur 등.
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-[14px] font-medium text-grey-700 border border-grey-300 rounded-lg hover:bg-grey-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                const trimmed = externalUrl.trim();
                if (trimmed && trimmed !== "https://") onInsert(trimmed);
              }}
              className="px-4 py-2 text-[14px] font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 cursor-pointer"
            >
              삽입
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 유튜브 모달 — 영상 URL 입력 → 임베드
// ─────────────────────────────────────────────────────────────
function YouTubeModal({
  onCancel,
  onInsert,
}: {
  onCancel: () => void;
  onInsert: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const trimmed = url.trim();
  // youtu.be / youtube.com 모두 지원. 유효성 간단 체크 — 자세한 파싱은 extension 위임.
  const valid = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(trimmed);

  return (
    <ModalShell title="유튜브 영상 임베드" onCancel={onCancel}>
      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-semibold text-grey-700 mb-1.5">
            유튜브 URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            autoFocus
            className="w-full h-11 px-3 text-[14px] border border-grey-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <p className="mt-1 text-[12px] text-grey-500">
            유튜브 영상 페이지 URL 또는 youtu.be 단축 링크. 쿠키 없는 모드로
            자동 변환돼요 (개인정보 영향 0).
          </p>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[14px] font-medium text-grey-700 border border-grey-300 rounded-lg hover:bg-grey-50 cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => valid && onInsert(trimmed)}
            className="px-4 py-2 text-[14px] font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            삽입
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 모달 공통 셸 — backdrop + 카드 + 닫기 (Esc·바깥 클릭)
// ─────────────────────────────────────────────────────────────
function ModalShell({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  // Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-grey-200">
          <h3 className="text-[15px] font-bold text-grey-900">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center text-grey-600 hover:bg-grey-100 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
