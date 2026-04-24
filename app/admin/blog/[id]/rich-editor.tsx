"use client";

// ============================================================
// RichEditor — 워드프레스 클래식 에디터 스타일 본문 편집기
// ============================================================
// TipTap 기반. 사장님이 raw HTML 안 보고 비주얼로 글 편집할 수 있게.
//
// 입출력: HTML 문자열 (기존 blog_posts.content 와 그대로 호환).
// initial 로 받은 HTML 을 set, 변경마다 hidden <input name="content"> 동기화 →
// 부모 server action form 이 그대로 작동.
//
// 툴바:
//   - 본문 스타일: H2 / H3 / 단락
//   - 글자 강조: 굵게 / 기울임 / 취소선
//   - 목록: 글머리표 / 번호
//   - 링크: 추가 / 제거
//   - 표: 3×3 삽입 / 행·열 추가·제거 / 표 제거
//   - 이미지: URL 입력 → 삽입
//   - 코드 블록 (HTML 일부 코드 보여줄 때)
//   - 실행 취소 / 다시 실행
//   - HTML 보기 토글 (raw HTML 보고 싶을 때)
// ============================================================

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useRef, useState } from "react";

type Props = {
  initialHtml: string;
  // form submit 시 함께 전송될 hidden input 의 name (기본 "content")
  name?: string;
};

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 코드 블록은 별도, 여기선 inline code 만 허용
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
}: {
  editor: Editor;
  showHtml: boolean;
  onToggleHtml: () => void;
  onOpenLinkModal: () => void;
  onOpenImageModal: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-grey-200 bg-grey-50">
      {/* 본문 스타일 */}
      <Btn
        active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
        title="단락"
        disabled={showHtml}
      >
        P
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="대제목 (H2)"
        disabled={showHtml}
      >
        H2
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="중제목 (H3)"
        disabled={showHtml}
      >
        H3
      </Btn>

      <Sep />

      {/* 강조 */}
      <Btn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="굵게 (Ctrl+B)"
        disabled={showHtml}
      >
        <b>B</b>
      </Btn>
      <Btn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="기울임 (Ctrl+I)"
        disabled={showHtml}
      >
        <i>I</i>
      </Btn>
      <Btn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="취소선"
        disabled={showHtml}
      >
        <s>S</s>
      </Btn>

      <Sep />

      {/* 목록 */}
      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="글머리 목록"
        disabled={showHtml}
      >
        • 목록
      </Btn>
      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="번호 목록"
        disabled={showHtml}
      >
        1. 목록
      </Btn>

      <Sep />

      {/* 링크 */}
      <Btn
        active={editor.isActive("link")}
        onClick={onOpenLinkModal}
        title="링크"
        disabled={showHtml}
      >
        🔗 링크
      </Btn>
      {editor.isActive("link") && (
        <Btn
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="링크 제거"
          disabled={showHtml}
        >
          ✕ 링크
        </Btn>
      )}

      <Sep />

      {/* 표 */}
      <Btn
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="3×3 표 삽입"
        disabled={showHtml}
      >
        ⊞ 표
      </Btn>
      {editor.isActive("table") && (
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

      <Sep />

      {/* 이미지 — 파일 업로드 또는 URL */}
      <Btn
        onClick={onOpenImageModal}
        title="이미지 업로드 또는 URL 삽입"
        disabled={showHtml}
      >
        🖼 이미지
      </Btn>

      {/* 코드 블록 */}
      <Btn
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="코드 블록"
        disabled={showHtml}
      >
        {"</>"}
      </Btn>

      <Sep />

      {/* 실행 취소 / 다시 실행 */}
      <Btn
        onClick={() => editor.chain().focus().undo().run()}
        title="실행 취소 (Ctrl+Z)"
        disabled={showHtml || !editor.can().undo()}
      >
        ↶
      </Btn>
      <Btn
        onClick={() => editor.chain().focus().redo().run()}
        title="다시 실행 (Ctrl+Y)"
        disabled={showHtml || !editor.can().redo()}
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
