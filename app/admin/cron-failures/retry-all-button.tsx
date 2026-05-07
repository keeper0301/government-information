"use client";

// Quick Win — 24h 실패한 모든 prefix 의 cron 한 번에 재시도.
// /admin/cron-failures 페이지 상단에 노출. 사장님이 prefix 카드 일일이 안 누르고 한 클릭으로 전부 재실행.

import { useState } from "react";
import { PREFIX_TO_PATH } from "./retry-button";

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | {
      kind: "done";
      total: number;
      ok: number;
      fail: number;
      details: { prefix: string; cronPath: string; ok: boolean; status: number; elapsedMs: number; error?: string }[];
    };

export function RetryAllButton({ prefixes }: { prefixes: string[] }) {
  const [state, setState] = useState<Result>({ kind: "idle" });

  // 알려진 prefix 만 필터 (PREFIX_TO_PATH 매핑된 것). 매핑 없는 prefix 는 fail 사유 명확.
  const known = prefixes.filter((p) => PREFIX_TO_PATH[p]);
  const unknown = prefixes.filter((p) => !PREFIX_TO_PATH[p]);

  if (known.length === 0) {
    return (
      <div className="text-xs text-grey-600">
        매핑된 prefix 없음 — 일괄 재시도 대상 0건
        {unknown.length > 0 && (
          <span className="text-grey-500"> · 미매핑 {unknown.length}건</span>
        )}
      </div>
    );
  }

  async function retryAll() {
    setState({ kind: "running" });
    const results = await Promise.all(
      known.map(async (prefix) => {
        const cronPath = PREFIX_TO_PATH[prefix]!;
        const start = Date.now();
        try {
          const res = await fetch("/api/admin/cron-retry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cronPath }),
          });
          const data = await res.json().catch(() => ({}));
          return {
            prefix,
            cronPath,
            ok: res.ok && (data.ok ?? false),
            status: res.status,
            elapsedMs: Date.now() - start,
            error: res.ok ? undefined : data.error || `HTTP ${res.status}`,
          };
        } catch (err) {
          return {
            prefix,
            cronPath,
            ok: false,
            status: 0,
            elapsedMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    const ok = results.filter((r) => r.ok).length;
    setState({
      kind: "done",
      total: results.length,
      ok,
      fail: results.length - ok,
      details: results,
    });
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={retryAll}
          disabled={state.kind === "running"}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.kind === "running"
            ? "🔄 일괄 재시도 중..."
            : `🔁 24h 실패 ${known.length}개 일괄 재시도`}
        </button>
        <span className="text-xs text-blue-900">
          {known.length}개 prefix 의 cron 을 동시 호출 (Promise.all)
          {unknown.length > 0 && (
            <span className="text-blue-700">
              {" "}· 미매핑 {unknown.length}건은 skip (PREFIX_TO_PATH 추가 필요)
            </span>
          )}
        </span>
      </div>

      {state.kind === "done" && (
        <div className="mt-3">
          <p
            className={`text-xs font-semibold ${
              state.fail === 0 ? "text-green-700" : "text-amber-700"
            }`}
          >
            {state.fail === 0
              ? `✅ 전체 ${state.total}건 모두 성공`
              : `⚠️ ${state.ok}/${state.total} 성공 · ${state.fail} 실패`}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-blue-700 hover:underline">
              자세히 보기
            </summary>
            <ul className="mt-2 space-y-1">
              {state.details.map((d) => (
                <li
                  key={d.prefix}
                  className="text-xs font-mono flex items-center gap-2"
                >
                  <span className={d.ok ? "text-green-700" : "text-red-700"}>
                    {d.ok ? "✓" : "✗"}
                  </span>
                  <span className="font-semibold">{d.prefix}</span>
                  <span className="text-grey-600 truncate">
                    {d.cronPath} · {d.elapsedMs}ms
                  </span>
                  {d.error && (
                    <span className="text-red-600 truncate">{d.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
