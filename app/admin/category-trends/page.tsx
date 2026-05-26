// ============================================================
// /admin/category-trends — 카테고리별 인기 추세 (2026-05-26 D5)
// ============================================================
// 7일 / 30일 / 90일 카테고리 별 신규 + view_count 통계.
// ============================================================

import { getCategoryTrends } from "@/lib/analytics/category-trends";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ range?: string }>;

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  welfare: { label: "복지", emoji: "🌷" },
  loan: { label: "대출", emoji: "💰" },
  news: { label: "정책 뉴스", emoji: "🗞️" },
  blog: { label: "블로그", emoji: "✍️" },
  기타: { label: "기타", emoji: "📂" },
};

export default async function CategoryTrendsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { range } = await searchParams;
  const days = range === "30" ? 30 : range === "90" ? 90 : 7;
  const stats = await getCategoryTrends(days);
  const maxCount = Math.max(...stats.stats.map((s) => s.count), 1);

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20 px-5">
      <div className="max-w-[960px] mx-auto">
        <div className="mb-6">
          <a
            href="/admin/autonomous"
            className="text-[13px] text-grey-600 no-underline hover:text-grey-700"
          >
            ← 자율 운영 hub
          </a>
          <h1 className="text-[24px] md:text-[28px] font-extrabold text-grey-900 mt-3 tracking-[-0.5px]">
            📊 카테고리별 인기 추세 ({days}일)
          </h1>
          <p className="text-[14px] text-grey-700 mt-2">
            news_posts 의 category 별 신규 + view_count 추세.
            사장님 콘텐츠 우선순위 시각화.
          </p>
          <div className="flex gap-2 mt-3">
            {[7, 30, 90].map((d) => (
              <a
                key={d}
                href={`/admin/category-trends?range=${d}`}
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
              <div className="text-[12px] text-grey-600 mb-1">
                {days}일 총 신규
              </div>
              <div className="text-[24px] font-extrabold text-grey-900">
                {stats.totalCount.toLocaleString()}건
              </div>
            </div>
            <div>
              <div className="text-[12px] text-grey-600 mb-1">
                {days}일 총 조회
              </div>
              <div className="text-[24px] font-extrabold text-emerald-700">
                {stats.totalViews.toLocaleString()}회
              </div>
              <div className="text-[11px] text-grey-500 mt-1">
                평균{" "}
                {stats.totalCount > 0
                  ? Math.round(stats.totalViews / stats.totalCount)
                  : 0}
                회/건
              </div>
            </div>
          </div>
        </section>

        {/* 카테고리별 차트 */}
        <section className="bg-white rounded-2xl border border-grey-100 p-5">
          <h2 className="text-[16px] font-bold text-grey-900 mb-4">
            카테고리별 신규 ({stats.stats.length}개)
          </h2>
          {stats.stats.length === 0 ? (
            <p className="text-[14px] text-grey-600">{days}일 신규 0건.</p>
          ) : (
            <div className="space-y-3">
              {stats.stats.map((s) => {
                const meta = CATEGORY_LABELS[s.category] ?? {
                  label: s.category,
                  emoji: "📂",
                };
                return (
                  <div key={s.category} className="flex items-center gap-3 text-[13px]">
                    <div className="w-[120px] flex items-center gap-1.5 text-grey-700 font-medium">
                      <span aria-hidden="true">{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 bg-blue-400 rounded"
                          style={{
                            width: `${(s.count / maxCount) * 100}%`,
                            minWidth: s.count > 0 ? "12px" : "0",
                          }}
                        />
                        <span className="text-grey-900 font-semibold">
                          {s.count.toLocaleString()}건
                        </span>
                      </div>
                      <div className="text-[11px] text-grey-600 mt-1">
                        조회 {s.totalViews.toLocaleString()}회 (평균{" "}
                        {s.avgViews.toLocaleString()}회/건)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
