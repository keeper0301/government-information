"use client";

import { useState } from "react";

/**
 * 네이버 블로그 큐 일괄 자동 발행 명령을 클립보드에 복사.
 *
 * 사장님이 PC 켤 때 클로드 채팅창에 prompt 붙여넣기 → 클로드가 사장님 Chrome 으로
 * 네이버 글쓰기 페이지 자동 입력 (마지막 "발행" 버튼은 사장님이 직접 클릭하는 가드).
 *
 * 환경변수 추가 0 — 사장님 Chrome 의 기존 네이버 로그인 세션 재사용.
 */
export function CopyPromptButton({
  ids,
  titles,
}: {
  ids: string[];
  titles: string[];
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [error, setError] = useState<string>("");

  if (ids.length === 0) return null;

  const prompt = buildPrompt(ids, titles);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("ok");
      setError("");
      // 3초 후 hint 사라지게
      setTimeout(() => setCopied(null), 3000);
    } catch (e) {
      setCopied("fail");
      setError((e as Error).message);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          🔁 일괄 발행 명령 복사 ({ids.length}건)
        </button>
        <span className="text-xs text-blue-900">
          → 클로드 채팅창에 붙여넣으면 사장님 Chrome 으로 자동 입력 (마지막 발행 버튼만 직접 클릭)
        </span>
      </div>
      {copied === "ok" && (
        <p className="mt-2 text-xs text-green-700 font-medium">
          ✅ 클립보드 복사 완료. 클로드 채팅창에 Ctrl+V 로 붙여넣으세요.
        </p>
      )}
      {copied === "fail" && (
        <p className="mt-2 text-xs text-red-700 font-medium">
          ❌ 복사 실패: {error}. 아래 prompt 를 직접 복사해주세요.
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-blue-700 hover:underline">
          복사될 prompt 미리보기
        </summary>
        <pre className="mt-2 p-2 bg-white border border-blue-100 rounded text-xs whitespace-pre-wrap font-mono text-grey-800 max-h-[200px] overflow-auto">
          {prompt}
        </pre>
      </details>
    </div>
  );
}

function buildPrompt(ids: string[], titles: string[]): string {
  const lines = ids.map((id, idx) => {
    const title = titles[idx] ?? "(제목 없음)";
    return `${idx + 1}. ${title} (큐 id: ${id.slice(0, 8)})`;
  });

  return [
    `네이버 블로그 큐에 쌓인 글 ${ids.length}건을 일괄 자동 발행 부탁합니다.`,
    "",
    "/admin/naver-blog 페이지를 열어서 각 카드의 「전체 복사」 후 새 탭에서 https://blog.naver.com/GoBlogWrite.naver 에 붙여넣고 발행해주세요. 마지막 「발행」 버튼은 제가 직접 클릭하겠습니다 (외부 게시 명시 승인 가드).",
    "",
    "발행할 글 목록:",
    ...lines,
    "",
    "각 발행 완료 후 어드민 페이지에 「발행 완료」 표시해주세요.",
  ].join("\n");
}
