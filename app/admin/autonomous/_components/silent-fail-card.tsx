// ============================================================
// autonomous hub — silent fail 감지 카드 (2026-05-22)
// ============================================================
// 24h source_code prefix 별 row count. 0건 발견 시 텔레그램 alert + 시각화.
// /api/cron/silent-fail-detect 와 같은 데이터 — PC 점검용 카드.
// ============================================================

import type { SilentFailStats } from "@/lib/analytics/silent-fail-stats";

export function SilentFailCard({ stats }: { stats: SilentFailStats }) {
  const hasFailure = stats.failedCount > 0;

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
            🛡️ silent fail 감지 (24h)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            매일 KST 08:00 cron · NOT NULL 누락 등 silent fail 자동 발견 ·
            2026-05-22 audit 사고 재발생 방지
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <a
            href="/admin/silent-fail-history?range=7"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            7일 ↗
          </a>
          <a
            href="/admin/silent-fail-history?range=30"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            30일 ↗
          </a>
          <a
            href="/admin/silent-fail-history?range=90"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            90일 ↗
          </a>
        </div>
      </header>

      {hasFailure && (
        <div className="mb-3 rounded bg-red-100 px-3 py-2 text-[12px] text-red-900">
          🚨 {stats.failedCount}개 prefix 24h row 0건 → cron audit 확인 + 코드
          review 권장. 텔레그램 alert 발송됨.
        </div>
      )}

      <div className="space-y-2">
        {stats.prefixes.map((p) => {
          const bg = p.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-300 bg-red-100 text-red-900";
          const icon = p.ok ? "✅" : "🚨";
          return (
            <div
              key={p.prefix}
              className={`flex items-center justify-between rounded border px-3 py-2 text-[13px] ${bg}`}
            >
              <div>
                <span className="mr-2">{icon}</span>
                <span className="font-medium">{p.label}</span>
                <span className="ml-2 text-[11px] opacity-75">
                  ({p.prefix}*)
                </span>
              </div>
              <div className="text-[13px] font-semibold">
                {p.count24h.toLocaleString("ko-KR")}건
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
