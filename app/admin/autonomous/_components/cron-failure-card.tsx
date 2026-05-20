// ============================================================
// autonomous hub — cron 실패 24h summary 카드 (2026-05-22)
// ============================================================
// 사장님 매일 PC 점검 시 한 화면 가시화.
// 0건 = ✅ / 1건+ = 빨강 + 최근 실패 5건 link
// ============================================================

import Link from "next/link";
import type { CronFailureStats } from "@/lib/analytics/cron-failure-stats";

function relativeMinutes(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function CronFailureCard({ stats }: { stats: CronFailureStats }) {
  const hasFailure = stats.count24h > 0;

  return (
    <section
      className={`rounded-xl border p-5 ${
        hasFailure
          ? "border-red-300 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            🚨 cron 실패 24h
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            cron_failure_log unique signature · health-alert cron 알림 발송 후
            이 카드에 잔존 표시
          </p>
        </div>
        <Link
          href="/admin/cron-failures"
          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          상세 ↗
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div
          className={`rounded border px-3 py-2 ${
            hasFailure
              ? "border-red-300 bg-red-100"
              : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <div className="text-[11px] text-slate-600">unique 실패</div>
          <div
            className={`font-semibold ${
              hasFailure ? "text-red-900" : "text-emerald-900"
            }`}
          >
            {stats.count24h}건
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">총 발생</div>
          <div className="font-semibold text-slate-900">
            {stats.totalOccurrences24h}회
          </div>
        </div>
      </div>

      {!hasFailure ? (
        <p className="rounded bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
          ✅ 24h 동안 cron 실패 0건. 모든 자동화 정상 가동 중.
        </p>
      ) : (
        <div className="space-y-2">
          {stats.recent.map((r) => (
            <div
              key={`${r.jobName}-${r.lastSeenAt}`}
              className="rounded border border-red-200 bg-white px-3 py-2 text-[12px]"
              title={r.errorMessage ?? undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-red-900">
                  {r.jobName}
                </span>
                <span className="text-[11px] text-slate-500">
                  {relativeMinutes(r.lastSeenAt)} · {r.occurrences}회
                </span>
              </div>
              {r.errorMessage && (
                <p className="text-[11px] text-slate-600 line-clamp-1">
                  {r.errorMessage}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
