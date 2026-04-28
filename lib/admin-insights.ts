// ============================================================
// /admin/insights 데이터 인사이트 — cohort funnel + 콘텐츠 효과 + 분포
// ============================================================
// 운영 의사결정 데이터화:
//   1. cohort funnel: 가입 → 온보딩 → 구독 → 알림 4단계 전환율
//   2. 콘텐츠 효과: blog/welfare/loan TOP view 정책 + 분포
//   3. 분포 통계: target/category/region/income 분포 — 어떤 사용자에게 어떤 정책이 매칭되는지
// ============================================================

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";

export type CohortFunnel = {
  signups: number;            // 가입 (auth.users)
  onboarded: number;          // user_profiles 작성
  subscribed: number;         // basic/pro 활성 구독
  notified: number;           // 알림 발송 받은 사용자 (distinct)
  conversionOnboarding: number; // signups → onboarded
  conversionSubscription: number; // onboarded → subscribed
  conversionNotification: number; // subscribed → notified
};

export type TopContentItem = {
  id: string;
  title: string;
  view_count: number;
  kind: "welfare" | "loan" | "blog";
};

export type DistributionItem = {
  label: string;
  count: number;
};

export type AdminInsights = {
  funnelAll: CohortFunnel;            // 전체 누적
  funnel30d: CohortFunnel;            // 최근 30일 cohort
  topWelfare: TopContentItem[];
  topLoan: TopContentItem[];
  topBlog: TopContentItem[];
  occupationDist: DistributionItem[];
  regionDist: DistributionItem[];
  incomeDist: DistributionItem[];
  benefitTagsDist: DistributionItem[];
};

// 사용자 cohort funnel 계산 — 4단계 전환율
async function calcFunnel(
  userIds: string[],
  sinceMs: number | null,
): Promise<CohortFunnel> {
  const admin = createAdminClient();
  const sinceIso = sinceMs ? new Date(sinceMs).toISOString() : null;
  const signups = userIds.length;

  if (signups === 0) {
    return {
      signups: 0,
      onboarded: 0,
      subscribed: 0,
      notified: 0,
      conversionOnboarding: 0,
      conversionSubscription: 0,
      conversionNotification: 0,
    };
  }

  // 병렬 조회 — onboarded·subscribed·notified
  const [profiles, subs, alerts] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id")
      .in("id", userIds),
    admin
      .from("subscriptions")
      .select("user_id")
      .in("user_id", userIds)
      .in("status", ["trialing", "active", "charging", "manual_grant"])
      .in("tier", ["basic", "pro"]),
    sinceIso
      ? admin
          .from("alert_deliveries")
          .select("user_id")
          .in("user_id", userIds)
          .eq("status", "sent")
          .gte("created_at", sinceIso)
      : admin
          .from("alert_deliveries")
          .select("user_id")
          .in("user_id", userIds)
          .eq("status", "sent"),
  ]);

  const onboarded = profiles.data?.length ?? 0;
  const subscribed = new Set(
    (subs.data ?? []).map((r: { user_id: string }) => r.user_id),
  ).size;
  const notified = new Set(
    (alerts.data ?? []).map((r: { user_id: string }) => r.user_id),
  ).size;

  return {
    signups,
    onboarded,
    subscribed,
    notified,
    conversionOnboarding: signups > 0 ? Math.round((onboarded / signups) * 100) : 0,
    conversionSubscription: onboarded > 0 ? Math.round((subscribed / onboarded) * 100) : 0,
    conversionNotification: subscribed > 0 ? Math.round((notified / subscribed) * 100) : 0,
  };
}

export const getAdminInsights = cache(async (): Promise<AdminInsights> => {
  const admin = createAdminClient();
  const since30Ms = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const since30Iso = new Date(since30Ms).toISOString();

  const users = await getAuthUsersCached();
  const allIds = users.map((u) => u.id);
  const cohort30Ids = users
    .filter((u) => u.created_at && u.created_at >= since30Iso)
    .map((u) => u.id);

  // 모든 인사이트 데이터 병렬
  const [
    funnelAll,
    funnel30d,
    topWelfareRes,
    topLoanRes,
    topBlogRes,
    profilesAll,
  ] = await Promise.all([
    calcFunnel(allIds, null),
    calcFunnel(cohort30Ids, since30Ms),
    admin
      .from("welfare_programs")
      .select("id, title, view_count")
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(10),
    admin
      .from("loan_programs")
      .select("id, title, view_count")
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(10),
    admin
      .from("blog_posts")
      .select("slug, title, view_count")
      .not("published_at", "is", null)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(10),
    admin
      .from("user_profiles")
      .select("region, occupation, income_level, benefit_tags"),
  ]);

  const topWelfare: TopContentItem[] = (topWelfareRes.data ?? []).map(
    (r: { id: string; title: string; view_count: number }) => ({
      ...r,
      kind: "welfare",
    }),
  );
  const topLoan: TopContentItem[] = (topLoanRes.data ?? []).map(
    (r: { id: string; title: string; view_count: number }) => ({
      ...r,
      kind: "loan",
    }),
  );
  const topBlog: TopContentItem[] = (topBlogRes.data ?? []).map(
    (r: { slug: string; title: string; view_count: number }) => ({
      id: r.slug,
      title: r.title,
      view_count: r.view_count,
      kind: "blog",
    }),
  );

  // 분포 계산 — user_profiles 컬럼별 빈도
  type Profile = {
    region: string | null;
    occupation: string | null;
    income_level: string | null;
    benefit_tags: string[] | null;
  };
  const profiles = (profilesAll.data ?? []) as Profile[];

  const countMap = (selector: (p: Profile) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const p of profiles) {
      const v = selector(p);
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const occupationDist = countMap((p) => p.occupation);
  const regionDist = countMap((p) => p.region);
  const incomeDist = countMap((p) => p.income_level);

  // benefit_tags 는 배열 — flatten 후 빈도
  const tagMap = new Map<string, number>();
  for (const p of profiles) {
    for (const tag of p.benefit_tags ?? []) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }
  const benefitTagsDist = Array.from(tagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    funnelAll,
    funnel30d,
    topWelfare,
    topLoan,
    topBlog,
    occupationDist,
    regionDist,
    incomeDist,
    benefitTagsDist,
  };
});
