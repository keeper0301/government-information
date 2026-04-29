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
// admin sub page 표준 헤더 — kicker · title · description 슬롯 통일
import { AdminPageHeader } from "@/components/admin/admin-page-header";

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
    <div className="max-w-[980px]">
      {/* 표준 헤더 슬롯 — F4 마이그레이션 */}
      <AdminPageHeader
        kicker="ADMIN · 지표·분석"
        title="데이터 인사이트"
        description="cohort funnel + 콘텐츠 효과 + 사용자 분포 통합. 어디서 이탈, 어떤 콘텐츠가 인기, 어떤 사용자가 가입하는지."
      />

      {/* Cohort funnel */}
      <h2 className="text-lg font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        🎯 Cohort Funnel
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <FunnelCard title="전체 누적" funnel={data.funnelAll} />
        <FunnelCard title="최근 30일 cohort" funnel={data.funnel30d} />
      </div>

      {/* Phase 4 — 24h 결제 신호 (매출 직결, 작은 변화도 즉시 가시화) */}
      <h2 className="text-lg font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        💳 24h 결제 신호
      </h2>
      <section className="bg-white rounded-lg border border-grey-200 p-5 mb-8">
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-grey-500">신규 결제 의도 (첫 진입, 24h)</dt>
            <dd className="text-2xl font-extrabold text-grey-900 tabular-nums mt-1">
              {data.subscriptionPulse.newAttempts24h.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-grey-500">활성 구독 (전체)</dt>
            <dd className="text-2xl font-extrabold text-blue-600 tabular-nums mt-1">
              {data.subscriptionPulse.activeTotal.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-grey-500">사용자 해지 (24h)</dt>
            <dd
              className={`text-2xl font-extrabold tabular-nums mt-1 ${
                data.subscriptionPulse.cancelled24h > 0
                  ? "text-red-500"
                  : "text-grey-900"
              }`}
            >
              {data.subscriptionPulse.cancelled24h.toLocaleString()}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-grey-500 mt-3 leading-[1.5]">
          * 신규 결제 의도 = subscriptions 행이 처음 만들어진 시점 (첫 /checkout 진입). 재시도는
          기존 행 갱신이라 안 잡힘. 활성 = trial 포함 basic/pro 결제 중. 해지 1 이상이면
          카카오 알림·결제 funnel 점검 필요.
        </p>
      </section>

      {/* 콘텐츠 효과 */}
      <h2 className="text-lg font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        🔥 콘텐츠 TOP (view_count 기준)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <TopList title="복지" items={data.topWelfare} />
        <TopList title="대출" items={data.topLoan} />
        <TopList title="블로그" items={data.topBlog} />
      </div>

      {/* 사용자 분포 */}
      <h2 className="text-lg font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        👥 사용자 분포 (user_profiles 기준)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <DistList title="지역" items={data.regionDist} />
        <DistList title="직업" items={data.occupationDist} />
        <DistList title="소득" items={data.incomeDist} />
        <DistList title="관심 분야 (benefit_tags)" items={data.benefitTagsDist} />
      </div>

      <p className="mt-10 text-sm">
        <Link href="/admin" className="text-blue-500 font-medium underline">
          ← 어드민 홈
        </Link>
      </p>
    </div>
  );
}

function FunnelCard({ title, funnel }: { title: string; funnel: CohortFunnel }) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <h3 className="text-base font-bold text-grey-900 mb-4 tracking-[-0.2px]">
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
        <span className="text-sm font-semibold text-grey-700">{label}</span>
        <span className="text-sm font-extrabold text-grey-900 tabular-nums">
          {value.toLocaleString()}명
          {rate !== undefined && (
            <span className="text-xs font-medium text-grey-600 ml-1">
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
      <h3 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.2px]">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-grey-600">view 기록 없음</p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${it.id}`}
              className="flex items-start gap-2 pb-2 border-b border-grey-100 last:border-b-0 last:pb-0"
            >
              <span
                className={`flex-shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-xs font-extrabold ${
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
                  className="block text-sm font-semibold text-grey-900 line-clamp-2 leading-[1.4] hover:text-blue-600 no-underline"
                >
                  {it.title}
                </Link>
                <span className="text-xs text-grey-600">
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
      <h3 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.2px]">
        {title} (총 {total}건)
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-grey-600">기록 없음</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
            return (
              <li key={it.label}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-grey-700 truncate">
                    {it.label}
                  </span>
                  <span className="text-xs font-semibold text-grey-900 tabular-nums">
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
