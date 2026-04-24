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

      {/* form 호환 hidden input — name="content" 그대로 server action 에 들어감 */}
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={initialHtml} />

      {/* TipTap 기본 prose 스타일 + 표 테두리 (간결 inline) */}
      <style jsx global>{`
        .rich-editor-content h2 {
          font-size: 22px;
          font-weight: 700;
          margin: 1.2em 0 0.5em;
        }
        .rich-editor-content h3 {
          font-size: 18px;
          font-weight: 700;
          margin: 1em 0 0.4em;
        }
        .rich-editor-content p {
          margin: 0.6em 0;
          line-height: 1.7;
        }
        .rich-editor-content ul,
        .rich-editor-content ol {
          padding-left: 1.5em;
          margin: 0.6em 0;
        }
        .rich-editor-content li {
          margin: 0.2em 0;
        }
        .rich-editor-content a {
          color: #2563eb;
          text-decoration: underline;
        }
        .rich-editor-content strong {
          font-weight: 700;
        }
        .rich-editor-content table {
          border-collapse: collapse;
          margin: 0.8em 0;
          width: 100%;
        }
        .rich-editor-content th,
        .rich-editor-content td {
          border: 1px solid #d1d5db;
          padding: 6px 10px;
          min-width: 80px;
        }
        .rich-editor-content th {
          background: #f3f4f6;
          font-weight: 600;
        }
        .rich-editor-content .rich-img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0.8em auto;
        }
        .rich-editor-content .rich-codeblock {
          background: #1f2937;
          color: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          font-family: "Menlo", monospace;
          font-size: 13px;
          overflow-x: auto;
        }
        .rich-editor-content .ProseMirror-selectednode {
          outline: 2px solid #2563eb;
        }
      `}</style>
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
}: {
  editor: Editor;
  showHtml: boolean;
  onToggleHtml: () => void;
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
        onClick={() => promptAndSetLink(editor)}
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

      {/* 이미지 */}
      <Btn
        onClick={() => promptAndInsertImage(editor)}
        title="이미지 URL 삽입"
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

// 링크 입력 — 기본 prompt (간단). 향후 모달로 업그레이드 가능.
function promptAndSetLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("링크 URL", previous ?? "https://");
  if (url === null) return; // 취소
  if (url === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function promptAndInsertImage(editor: Editor) {
  const url = window.prompt("이미지 URL (https://...)", "https://");
  if (!url || url === "https://") return;
  editor.chain().focus().setImage({ src: url }).run();
}
