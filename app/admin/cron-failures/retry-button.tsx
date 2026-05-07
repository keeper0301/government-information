"use client";

// Phase 6 — 사장님이 cron prefix 별로 즉시 재실행하는 버튼.
// /admin/cron-failures page 의 prefix 카드 헤더에 사용.

import { useState } from "react";

// prefix → cron path 매핑. cron_failure_log 의 job_name 첫 단어와 일치.
// 새 cron 추가 시 이 매핑 + cron-retry route.ts 의 ALLOWED_PATHS 둘 다 갱신.
export const PREFIX_TO_PATH: Record<string, string> = {
  collect: "/api/collect-news",
  enrich: "/api/enrich",
  alert: "/api/alert-dispatch",
  finalize: "/api/finalize-deletions",
  cleanup: "/api/cleanup-expired-programs",
  billing: "/api/billing/charge",
  health: "/api/cron/health-alert",
  // 어드민 자동화 마스터 #1 인벤토리 후 추가 (2026-05-07)
  dedupe: "/api/dedupe-detect",
  press: "/api/cron/press-ingest",
  onboarding: "/api/cron/onboarding-reminder",
  weekly: "/api/cron/weekly-digest",
  daily: "/api/cron/daily-digest",
  news: "/api/cron/news-classify",
  naver: "/api/cron/naver-queue-alert",
  indexnow: "/api/indexnow-submit-recent",
  targeting: "/api/enrich-targeting",
  thumbnails: "/api/enrich-thumbnails",
};

export function CronRetryButton({ prefix }: { prefix: string }) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "fail">(
    "idle",
  );
  const [msg, setMsg] = useState<string>("");

  const cronPath = PREFIX_TO_PATH[prefix];
  if (!cronPath) return null; // 알려진 prefix 만 버튼 노출

  async function retry() {
    setState("running");
    setMsg("");
    try {
      const res = await fetch("/api/admin/cron-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("ok");
        setMsg(`재실행 완료 (${data.elapsedMs}ms)`);
      } else {
        setState("fail");
        setMsg(data.error || `실패 ${data.status}`);
      }
    } catch (err) {
      setState("fail");
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={state === "running"}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer border-none disabled:opacity-50"
      >
        {state === "running" ? "실행 중..." : "재실행"}
      </button>
      {msg && (
        <span
          className={`text-xs ${state === "ok" ? "text-green-700" : "text-red-700"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
