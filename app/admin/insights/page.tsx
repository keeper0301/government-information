// ============================================================
// /admin/insights — 데이터 인사이트 통합 페이지
// ============================================================
// cohort funnel (가입 → 온보딩 → 구독 → 알림) + 콘텐츠 효과 + 사용자 분포.
// 운영 의사결정 데이터화 — 어디서 이탈, 어떤 콘텐츠가 인기, 어떤 사용자가 가입.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  getAdminInsights,
  type CohortFunnel,
  type TopContentItem,
  type DistributionItem,
} from "@/lib/admin-insights";

export const metadata: Metadata = {
  title: "인사이트 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/insights");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminInsightsPage() {
  await requireAdmin();
  const data = await getAdminInsights();

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[980px] mx-auto px-5">
        <div className="mb-8">
          <p className="text-[12px] text-blue-500 font-semibold tracking-[0.2em] mb-3">
            ADMIN · 인사이트
          </p>
          <h1 className="text-[26px] font-extrabold tracking-[-0.6px] text-grey-900 mb-2">
            데이터 인사이트
          </h1>
          <p className="text-[14px] text-grey-700 leading-[1.6]">
            cohort funnel + 콘텐츠 효과 + 사용자 분포 통합. 어디서 이탈,
            어떤 콘텐츠가 인기, 어떤 사용자가 가입하는지.
          </p>
        </div>

        {/* Cohort funnel */}
        <h2 className="text-[18px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🎯 Cohort Funnel
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <FunnelCard title="전체 누적" funnel={data.funnelAll} />
          <FunnelCard title="최근 30일 cohort" funnel={data.funnel30d} />
        </div>

        {/* 콘텐츠 효과 */}
        <h2 className="text-[18px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          🔥 콘텐츠 TOP (view_count 기준)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <TopList title="복지" items={data.topWelfare} />
          <TopList title="대출" items={data.topLoan} />
          <TopList title="블로그" items={data.topBlog} />
        </div>

        {/* 사용자 분포 */}
        <h2 className="text-[18px] font-bold text-grey-900 mb-3 tracking-[-0.3px]">
          👥 사용자 분포 (user_profiles 기준)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <DistList title="지역" items={data.regionDist} />
          <DistList title="직업" items={data.occupationDist} />
          <DistList title="소득" items={data.incomeDist} />
          <DistList title="관심 분야 (benefit_tags)" items={data.benefitTagsDist} />
        </div>

        <p className="mt-10 text-[13px]">
          <Link href="/admin" className="text-blue-500 font-medium underline">
            ← 어드민 홈
          </Link>
        </p>
      </div>
    </main>
  );
}

function FunnelCard({ title, funnel }: { title: string; funnel: CohortFunnel }) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <h3 className="text-[15px] font-bold text-grey-900 mb-4 tracking-[-0.2px]">
        {title}
      </h3>
      <FunnelStep label="가입" value={funnel.signups} />
      <FunnelStep
        label="온보딩 완료"
        value={funnel.onboarded}
        rate={funnel.conversionOnboarding}
      />
      <FunnelStep
        label="구독 (basic/pro)"
        value={funnel.subscribed}
        rate={funnel.conversionSubscription}
      />
      <FunnelStep
        label="알림 발송"
        value={funnel.notified}
        rate={funnel.conversionNotification}
        last
      />
    </div>
  );
}

function FunnelStep({
  label,
  value,
  rate,
  last,
}: {
  label: string;
  value: number;
  rate?: number;
  last?: boolean;
}) {
  const max = 100;
  const pct = rate ?? 100;
  return (
    <div className={last ? "" : "mb-3"}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-semibold text-grey-700">{label}</span>
        <span className="text-[14px] font-extrabold text-grey-900 tabular-nums">
          {value.toLocaleString()}명
          {rate !== undefined && (
            <span className="text-[12px] font-medium text-grey-600 ml-1">
              ({rate}%)
            </span>
          )}
        </span>
      </div>
      <div className="h-2 bg-grey-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-[width]"
          style={{ width: `${Math.min(pct, max)}%` }}
        />
      </div>
    </div>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: TopContentItem[];
}) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <h3 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.2px]">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-[13px] text-grey-600">view 기록 없음</p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${it.id}`}
              className="flex items-start gap-2 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
            >
              <span
                className={`flex-shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold ${
                  i < 3
                    ? "bg-orange-50 text-orange-600"
                    : "bg-grey-50 text-grey-500"
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/${it.kind}/${it.id}`}
                  className="block text-[13px] font-semibold text-grey-900 line-clamp-2 leading-[1.4] hover:text-blue-600 no-underline"
                >
                  {it.title}
                </Link>
                <span className="text-[11px] text-grey-600">
                  조회 {it.view_count.toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DistList({
  title,
  items,
}: {
  title: string;
  items: DistributionItem[];
}) {
  const total = items.reduce((s, it) => s + it.count, 0);
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <h3 className="text-[15px] font-bold text-grey-900 mb-3 tracking-[-0.2px]">
        {title} (총 {total}건)
      </h3>
      {items.length === 0 ? (
        <p className="text-[13px] text-grey-600">기록 없음</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
            return (
              <li key={it.label}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[13px] text-grey-700 truncate">
                    {it.label}
                  </span>
                  <span className="text-[12px] font-semibold text-grey-900 tabular-nums">
                    {it.count} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-grey-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
