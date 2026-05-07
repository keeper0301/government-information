"use client";

import { useActionState } from "react";
import {
  republishLatestBlogAction,
  type RepublishState,
} from "./actions";

const initialState: RepublishState = { kind: "idle" };

/**
 * 검증용 트리거 버튼 — 클릭 시 server action 호출 후 결과를 화면에 명시적 표시.
 * useActionState 로 서버 응답을 client state 로 받아 성공·실패 메시지를 보여준다.
 */
export function RepublishButton() {
  const [state, formAction, isPending] = useActionState(
    republishLatestBlogAction,
    initialState,
  );

  return (
    <form action={formAction} className="mb-5">
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "🔄 발행 시도 중..." : "🚀 최신 글 워드프레스 재발행 (검증용)"}
      </button>
      <p className="mt-2 text-xs text-grey-500">
        keepioo 최신 발행 글 1건을 워드프레스에 즉시 재발행 시도. 결과는 아래 박스에 표시됩니다.
      </p>

      {/* 결과 표시 — 성공·실패 모두 명시적으로 노출 */}
      {state.kind === "ok" && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold mb-1">✅ {state.message}</p>
          <p className="text-xs mt-2">
            워드프레스 글 URL:{" "}
            <a
              href={state.wpPostUrl}
              target="_blank"
              rel="noopener"
              className="underline font-medium break-all"
            >
              {state.wpPostUrl}
            </a>
          </p>
        </div>
      )}

      {state.kind === "fail" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold mb-1">❌ 발행 실패</p>
          <p className="text-xs leading-[1.7]">{state.message}</p>
          <p className="mt-2 text-xs text-red-700 font-mono">
            사유 코드: {state.reason}
          </p>
        </div>
      )}
    </form>
  );
}
