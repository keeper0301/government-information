// ============================================================
// /admin/silent-fail-history — 7일 silent_fail 추세 page (2026-05-26 D4)
// ============================================================
// 매일 KST 09:00 cron 의 silent_fail (fetched>0 + inserted=0 + errors>0) 추적.
// 시·군별 누적 + 일자별 차트.
// ============================================================

import { getSilentFailHistory } from "@/lib/analytics/silent-fail-history";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ range?: string }>;

export default async function SilentFailHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { range } = await searchParams;
  // 2026-05-26 D4 강화: range query (7|30|90). default 7.
  const days = range === "30" ? 30 : range === "90" ? 90 : 7;
  const stats = await getSilentFailHistory(days);
  const maxDay = Math.max(...stats.days.map((d) => d.silentFailCount), 1);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20 px-5">
      <div className="max-w-[960px] mx-auto">
        <div className="mb-6">
          <a href="/admin/autonomous" className="text-[13px] text-grey-600 no-underline hover:text-grey-700">
            ← 자율 운영 hub
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            🛡️ silent_fail 추세 ({days}일)
          </h1>
          <p className="text-[14px] text-grey-700 mt-2">
            시·군 cron 의 silent_fail (fetched&gt;0 + inserted=0 + errors&gt;0) 패턴 추적.
            검수 우선순위 시각화.
          </p>
          {/* range 전환 */}
          <div className="flex gap-2 mt-3">
            {[7, 30, 90].map((d) => (
              <a
                key={d}
                href={`/admin/silent-fail-history?range=${d}`}
                className={`px-3 py-1 text-[12px] rounded border ${
                  days === d
                    ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold"
                    : "bg-white border-grey-200 text-grey-600 hover:border-grey-400"
                }`}
              >
                {d}일
              </a>
            ))}
          </div>
        </div>

        {/* 요약 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5 mb-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] text-grey-600 mb-1">{days}일 총 cron 회차</div>
              <div className="text-[24px] font-extrabold text-grey-900">
                {stats.totalRuns.toLocaleString()}건
              </div>
            </div>
            <div>
              <div className="text-[12px] text-grey-600 mb-1">{days}일 silent_fail</div>
              <div className="text-[24px] font-extrabold text-amber-700">
                {stats.totalSilentFails.toLocaleString()}건
              </div>
              <div className="text-[11px] text-grey-500 mt-1">
                비율 {stats.totalRuns > 0
                  ? ((stats.totalSilentFails / stats.totalRuns) * 100).toFixed(1)
                  : "0"}%
              </div>
            </div>
          </div>
        </section>

        {/* 일자별 차트 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5 mb-5">
          <h2 className="text-[16px] font-bold text-grey-900 mb-4">일자별 차트 (KST)</h2>
          <div className="space-y-2">
            {stats.days.map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-[13px]">
                <div className="w-[80px] text-grey-600 font-mono">{d.date.slice(5)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-5 bg-amber-400 rounded"
                      style={{ width: `${(d.silentFailCount / maxDay) * 100}%`, minWidth: d.silentFailCount > 0 ? "12px" : "0" }}
                    />
                    <span className="text-grey-900 font-semibold">
                      {d.silentFailCount}건
                    </span>
                    <span className="text-grey-500 text-[12px]">
                      / {d.totalRuns}회
                    </span>
                  </div>
                  {d.topCities.length > 0 && (
                    <div className="text-[11px] text-grey-600 mt-1">
                      {d.topCities.join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 시·군별 누적 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5">
          <h2 className="text-[16px] font-bold text-grey-900 mb-4">
            시·군별 누적 ({days}일, {stats.cityTotals.length}개)
          </h2>
          {stats.cityTotals.length === 0 ? (
            <p className="text-[14px] text-emerald-700">silent_fail 0건. ✅ 정상</p>
          ) : (
            <ul className="divide-y divide-grey-100">
              {stats.cityTotals.map((c) => (
                <li key={c.city} className="py-2 flex items-center justify-between text-[13px]">
                  <span className="text-grey-900">{c.city}</span>
                  <span className="text-amber-700 font-semibold">{c.count}건</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
