"use client";

// 어드민 자동화 #5 + Quick Win — targeting 백필 즉시 실행 버튼.
// 기존: 사장님이 curl + Bearer token 으로 터미널에서 직접 실행.
// 변경: 한 클릭으로 /api/admin/cron-retry → /api/enrich-targeting 호출.

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; elapsedMs: number; data: unknown }
  | { kind: "fail"; error: string };

export function TargetingRunNowButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function runNow() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/admin/cron-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronPath: "/api/enrich-targeting" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setState({
          kind: "ok",
          elapsedMs: body.elapsedMs ?? 0,
          data: body.data ?? null,
        });
      } else {
        setState({
          kind: "fail",
          error: body.error || `HTTP ${res.status}`,
        });
      }
    } catch (e) {
      setState({
        kind: "fail",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runNow}
          disabled={state.kind === "running"}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.kind === "running"
            ? "🔄 실행 중..."
            : "⚡ 지금 실행 (1000건 백필)"}
        </button>
        <span className="text-xs text-grey-700">
          1회 호출 = 최대 1000건 처리. 미분석 공고 남아있으면 이 버튼을 다시 누르세요.
        </span>
      </div>

      {state.kind === "ok" && (
        <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-900">
          ✅ 완료 ({state.elapsedMs}ms) — 페이지 새로고침하면 분석 진행률에 반영됩니다.
        </div>
      )}
      {state.kind === "fail" && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          ❌ 실패: {state.error}
        </div>
      )}
    </div>
  );
}
