import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AlertList } from "./alert-list";
import { AlertReliabilityPanel } from "./alert-reliability-panel";
import { WeeklyAlertPreviewCard } from "./weekly-alert-preview-card";
import { PushToggle } from "@/components/push-toggle";
import { getUserTier } from "@/lib/subscription";
import { getUserConsents } from "@/lib/consent";
import { buildAlertReliabilitySummary } from "@/lib/alerts/reliability";
import { findMatchingPrograms, type AlertRule, type MatchedProgram } from "@/lib/alerts/matching";
import { buildWeeklyAlertPreview } from "@/lib/alerts/weekly-preview";

export const metadata: Metadata = {
  title: "알림센터 — 정책알리미",
  description: "내가 등록한 마감 알림을 확인하고 관리하세요.",
  robots: { index: false, follow: true },
};

// 알림센터 페이지 — 로그인 필수
// middleware 에서 미로그인 접근을 미리 차단하지만, 세션 만료 등
// 드문 경우를 대비해 페이지에서도 한 번 더 확인 후 로그인으로 돌려보냄
export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/alerts");
  }

  const [tier, { data: businessProfile }, alertRulesResult, { count: savedDeadlineAlertsCount }, consents] =
    await Promise.all([
      getUserTier(user.id),
      supabase
        .from("business_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_alert_rules")
        .select(
          "id, user_id, name, region_tags, district, age_tags, occupation_tags, benefit_tags, household_tags, income_target, keyword, channels, phone_number, is_active",
          { count: "exact" },
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(5),
      supabase
        .from("alarm_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true),
      getUserConsents(user.id),
    ]);

  const activeAlertRules = (alertRulesResult.data ?? []) as AlertRule[];
  const activeAlertRulesCount = alertRulesResult.count ?? activeAlertRules.length;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const matchedProgramMap = new Map<string, MatchedProgram>();
  for (const rule of activeAlertRules) {
    const matches = await findMatchingPrograms(admin, rule, since, 5);
    for (const program of matches) {
      matchedProgramMap.set(`${program.table}:${program.id}`, program);
    }
  }

  const hasKakaoConsent = consents.some(
    (consent) =>
      consent.consentType === "kakao_messaging" &&
      consent.isActive &&
      !consent.isExpired,
  );
  const reliabilitySummary = buildAlertReliabilitySummary({
    tier,
    hasBusinessProfile: Boolean(businessProfile),
    activeAlertRulesCount: activeAlertRulesCount ?? 0,
    hasEmail: Boolean(user.email),
    hasKakaoConsent,
  });
  const weeklyPreview = buildWeeklyAlertPreview({
    tier,
    activeAlertRulesCount,
    savedDeadlineAlertsCount: savedDeadlineAlertsCount ?? 0,
    matchedPrograms: Array.from(matchedProgramMap.values()),
  });

  return (
    <main className="max-w-content mx-auto px-5 lg:px-10 pt-[80px] pb-20">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        알림센터
      </h1>
      <p className="text-[15px] text-grey-600 mb-6">
        등록한 마감 알림을 확인하고 관리하세요
      </p>

      <AlertReliabilityPanel summary={reliabilitySummary} />

      <WeeklyAlertPreviewCard preview={weeklyPreview} />

      {/* 2026-05-31 P3 #8 — 알림센터에 PushToggle prominent 노출.
          마이페이지 계정 탭의 깊은 위치 외에 알림 사용자가 가장 자주 보는
          페이지에서도 즉시 구독 가능. PushToggle 자체가 subscribed 상태면
          작은 indicator 만 보이므로 이미 구독한 사용자에게는 noise 0. */}
      <div className="mb-8">
        <PushToggle />
      </div>

      <AlertList />
    </main>
  );
}
