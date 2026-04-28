"use client";

// Phase 6 — 사장님이 cron prefix 별로 즉시 재실행하는 버튼.
// /admin/cron-failures page 의 prefix 카드 헤더에 사용.

import { useState } from "react";

const PREFIX_TO_PATH: Record<string, string> = {
  collect: "/api/collect-news",
  enrich: "/api/enrich",
  alert: "/api/alert-dispatch",
  finalize: "/api/finalize-deletions",
  cleanup: "/api/cleanup",
  billing: "/api/billing/charge",
  health: "/api/cron/health-alert",
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
        className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer border-none disabled:opacity-50"
      >
        {state === "running" ? "실행 중..." : "재실행"}
      </button>
      {msg && (
        <span
          className={`text-[11px] ${state === "ok" ? "text-green-700" : "text-red-700"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
