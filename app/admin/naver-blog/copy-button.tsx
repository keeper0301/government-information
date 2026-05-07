"use client";

import { useState } from "react";

/**
 * 네이버 블로그용 제목·본문을 한 번에 clipboard 에 복사.
 *
 * 동작:
 *  - 사장님이 "전체 복사" 클릭 → clipboard 에 "제목\n\n본문" 형태로 들어감
 *  - 네이버 글쓰기 페이지에서 제목 영역에 paste → 자동으로 첫 줄만 들어가지 X
 *    (네이버 에디터는 한 번에 paste 시 모두 본문에 들어감)
 *  - 따라서 제목·본문 분리 복사 옵션도 제공 (가장 안전한 흐름)
 */
export function CopyButton({ title, body }: { title: string; body: string }) {
  const [state, setState] = useState<"idle" | "title" | "body" | "all">("idle");

  async function copy(text: string, kind: "title" | "body" | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setState(kind);
      setTimeout(() => setState("idle"), 1500);
    } catch {
      // 일부 브라우저는 secure context 외에서 clipboard 권한 거부 — fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setState(kind);
      setTimeout(() => setState("idle"), 1500);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 items-end whitespace-nowrap">
      <button
        type="button"
        onClick={() => copy(`${title}\n\n${body}`, "all")}
        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {state === "all" ? "✓ 복사됨" : "전체 복사"}
      </button>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => copy(title, "title")}
          className="px-2 py-1 text-[11px] bg-grey-100 text-grey-700 rounded hover:bg-grey-200"
        >
          {state === "title" ? "✓" : "제목만"}
        </button>
        <button
          type="button"
          onClick={() => copy(body, "body")}
          className="px-2 py-1 text-[11px] bg-grey-100 text-grey-700 rounded hover:bg-grey-200"
        >
          {state === "body" ? "✓" : "본문만"}
        </button>
      </div>
    </div>
  );
}
