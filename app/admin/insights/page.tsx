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
import {
  getAdminInstagramInsights,
  type AdminInstagramInsights,
  type InstagramPerformanceSummary,
} from "@/lib/admin-instagram-insights";

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
  const [data, instagram] = await Promise.all([
    getAdminInsights(),
    getAdminInstagramInsights(),
  ]);

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

      <InstagramPerformanceSection data={instagram} />

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

function InstagramPerformanceSection({ data }: { data: AdminInstagramInsights }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-grey-900 mb-3 tracking-[-0.3px]">
        📈 Instagram 성과
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <InstagramSummaryCard title="최근 24h" summary={data.summary24h} />
        <InstagramSummaryCard title="최근 7d" summary={data.summary7d} />
      </div>

      <div className="bg-white rounded-lg border border-grey-200 p-5 mb-4">
        <h3 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.2px]">
          게시물별 성과
        </h3>
        {data.posts.length === 0 ? (
          <p className="text-sm text-grey-600">최근 7일 Instagram 인사이트 수집 기록 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-grey-500">
                <tr>
                  <th className="py-2 pr-3">판정</th>
                  <th className="py-2 pr-3">카테고리</th>
                  <th className="py-2 pr-3">제목</th>
                  <th className="py-2 pr-3 text-right">Reach</th>
                  <th className="py-2 pr-3 text-right">Save</th>
                  <th className="py-2 pr-3 text-right">Share</th>
                  <th className="py-2 pr-3">Hook</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.slice(0, 10).map((post) => (
                  <tr key={post.mediaId} className="border-t border-grey-100">
                    <td className="py-2 pr-3">
                      <InstagramSignalBadge signal={post.signal} />
                    </td>
                    <td className="py-2 pr-3 text-grey-700">{post.category ?? "미분류"}</td>
                    <td className="py-2 pr-3 text-grey-900 max-w-[260px]">
                      <Link href={`/blog/${post.slug}`} className="line-clamp-2 no-underline hover:text-blue-600">
                        {post.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{post.reach.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{post.saved.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{post.shares.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-grey-600 max-w-[180px]">
                      <span className="line-clamp-2">{post.cardHookLabel ?? "미기록"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InstagramRollupList
          title="카테고리별"
          items={data.categories.map((it) => ({
            key: it.category,
            label: it.category,
            sub: `${it.posts}건 · reach ${it.reach.toLocaleString()}`,
            score: it.saved + it.shares,
          }))}
        />
        <InstagramRollupList
          title="Hook별"
          items={data.hooks.map((it) => ({
            key: it.hookType,
            label: it.hookLabel,
            sub: `${it.posts}건 · 저장률 ${it.saveRate}% · 공유률 ${it.shareRate}%`,
            score: it.saved + it.shares,
          }))}
        />
      </div>
    </section>
  );
}

function InstagramSummaryCard({ title, summary }: { title: string; summary: InstagramPerformanceSummary }) {
  const signalClass = summary.saved + summary.shares > 0
    ? "text-green-600"
    : summary.reach >= 30
      ? "text-yellow-600"
      : "text-red-500";
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-bold text-grey-900 tracking-[-0.2px]">{title}</h3>
        <span className={`text-xs font-bold ${signalClass}`}>
          {summary.saved + summary.shares > 0 ? "GOOD" : summary.reach >= 30 ? "WEAK" : "BAD"}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <Metric label="발행" value={summary.posts} />
        <Metric label="Reach" value={summary.reach} />
        <Metric label="Save" value={summary.saved} />
        <Metric label="Share" value={summary.shares} />
        <Metric label="Profile" value={summary.profileActivity} />
        <Metric label="SaveRate" value={`${summary.saveRate}%`} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[11px] text-grey-500">{label}</dt>
      <dd className="text-xl font-extrabold text-grey-900 tabular-nums mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}

function InstagramSignalBadge({ signal }: { signal: "good" | "weak" | "bad" }) {
  const cls = signal === "good"
    ? "bg-green-50 text-green-700"
    : signal === "weak"
      ? "bg-yellow-50 text-yellow-700"
      : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${cls}`}>{signal}</span>;
}

function InstagramRollupList({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; sub: string; score: number }>;
}) {
  return (
    <div className="bg-white rounded-lg border border-grey-200 p-5">
      <h3 className="text-base font-bold text-grey-900 mb-3 tracking-[-0.2px]">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-grey-600">기록 없음</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 border-b border-grey-100 pb-2 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-grey-900 truncate">{item.label}</div>
                <div className="text-xs text-grey-500">{item.sub}</div>
              </div>
              <div className="text-sm font-extrabold text-grey-900 tabular-nums">{item.score}</div>
            </li>
          ))}
        </ul>
      )}
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
