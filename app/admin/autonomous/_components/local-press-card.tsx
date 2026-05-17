// ============================================================
// autonomous hub — 시·군 보도자료 collector 24h 통계 카드 (5/17)
// ============================================================
// 20 시·군 cron 결과를 한눈에. inserted + error 가 시각화.
// ============================================================

import Link from "next/link";
import type { LocalPressStats } from "@/lib/analytics/local-press-stats";

function relativeMinutes(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function LocalPressCard({ stats }: { stats: LocalPressStats }) {
  const healthyCount = stats.cities.filter(
    (c) => c.inserted24h > 0 && c.errors24h === 0,
  ).length;
  const erroredCount = stats.cities.filter((c) => c.errors24h > 0).length;
  const idleCount = stats.cities.filter(
    (c) => c.inserted24h === 0 && c.errors24h === 0,
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            🗞️ 시·군 보도자료 collector
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            매일 KST 09:00 cron · {stats.cities.length} 시·군 ·{" "}
            {relativeMinutes(stats.lastCronAt)}
          </p>
        </div>
        <Link
          href="/admin/scrape-local"
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          수동 호출 ↗
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] text-emerald-700">정상</div>
          <div className="font-semibold text-emerald-900">{healthyCount}건</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[11px] text-amber-700">오류</div>
          <div className="font-semibold text-amber-900">{erroredCount}건</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">유휴</div>
          <div className="font-semibold text-slate-900">{idleCount}건</div>
        </div>
      </div>

      <div className="mb-3 text-xs text-slate-600">
        24h: <span className="font-medium text-slate-900">{stats.totalInserted24h}건</span>{" "}
        등록 · fetched {stats.totalFetched24h}건 · 오류{" "}
        <span className={stats.totalErrors24h > 0 ? "text-amber-700 font-medium" : ""}>
          {stats.totalErrors24h}건
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {stats.cities.map((c) => {
          const status =
            c.errors24h > 0
              ? "error"
              : c.inserted24h > 0
                ? "ok"
                : "idle";
          const bg =
            status === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : status === "error"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-slate-50 border-slate-200 text-slate-600";
          return (
            <div
              key={c.city}
              className={`rounded border ${bg} px-2 py-1.5 text-xs`}
              title={c.lastError ?? undefined}
            >
              <div className="truncate font-medium">{c.city}</div>
              <div className="text-[10px] opacity-75">
                +{c.inserted24h}
                {c.errors24h > 0 ? ` · 오류 ${c.errors24h}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {erroredCount > 0 && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          오류 발생 시·군은 해당 시청 사이트 selector 변경 가능성. cron 다음 회차
          (KST 09:00) 자동 재시도. 3일 연속 실패 시 collector regex 점검 필요.
        </p>
      )}
    </section>
  );
}
