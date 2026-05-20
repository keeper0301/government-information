import { createAdminClient } from "@/lib/supabase/admin";

export type PersonalizationStatusTone = "good" | "neutral" | "warn" | "danger";

export type PersonalizationStatusInput = {
  profileTotal: number;
  profileReady: number;
  activeRules: number;
  autoRules: number;
  deliveries24h: number;
  sent24h: number;
  failed24h: number;
  queued24h: number;
};

export type PersonalizationStatusCard = {
  key: "profile-ready" | "active-rules" | "sent-24h" | "failed-24h";
  label: string;
  value: number;
  suffix: string;
  hint: string;
  tone: PersonalizationStatusTone;
  href: string;
};

export type PersonalizationStatusSummary = PersonalizationStatusInput & {
  profileReadyPercent: number;
  deliveryFailureRate: number;
  healthLabel: "정상" | "주의" | "위험";
  healthTone: Exclude<PersonalizationStatusTone, "neutral">;
  cards: PersonalizationStatusCard[];
};

type CountResult = {
  count: number | null;
  error?: { message?: string } | null;
};

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function countOrZero(label: string, result: CountResult): number {
  if (result.error) {
    console.warn(`[personalization-status] ${label} count failed:`, result.error.message);
    return 0;
  }
  return result.count ?? 0;
}

function getFailureTone(
  failed24h: number,
  deliveryFailureRate: number,
): Exclude<PersonalizationStatusTone, "neutral"> {
  if (failed24h >= 5 || deliveryFailureRate >= 20) return "danger";
  if (failed24h > 0 || deliveryFailureRate > 0) return "warn";
  return "good";
}

export function buildPersonalizationStatusSummary(
  input: PersonalizationStatusInput,
): PersonalizationStatusSummary {
  const profileReadyPercent = percent(input.profileReady, input.profileTotal);
  const deliveryFailureRate = percent(input.failed24h, input.deliveries24h);
  const failureTone = getFailureTone(input.failed24h, deliveryFailureRate);
  const healthLabel =
    failureTone === "danger" ? "위험" : failureTone === "warn" ? "주의" : "정상";

  return {
    ...input,
    profileReadyPercent,
    deliveryFailureRate,
    healthLabel,
    healthTone: failureTone,
    cards: [
      {
        key: "profile-ready",
        label: "추천 준비 프로필",
        value: input.profileReady,
        suffix: "명",
        hint: `전체 ${input.profileTotal.toLocaleString()}명 중 ${profileReadyPercent}%`,
        tone: profileReadyPercent >= 50 ? "good" : "neutral",
        href: "/admin/recommendation-trace",
      },
      {
        key: "active-rules",
        label: "활성 알림 규칙",
        value: input.activeRules,
        suffix: "개",
        hint: `자동 규칙 ${input.autoRules.toLocaleString()}개 포함`,
        tone: input.activeRules > 0 ? "neutral" : "warn",
        href: "/admin/alert-simulator",
      },
      {
        key: "sent-24h",
        label: "24h 정책함 도착",
        value: input.sent24h,
        suffix: "건",
        hint: `전체 발송 시도 ${input.deliveries24h.toLocaleString()}건`,
        tone: input.sent24h > 0 ? "good" : "neutral",
        href: "/admin/alimtalk",
      },
      {
        key: "failed-24h",
        label: "24h 발송 실패",
        value: input.failed24h,
        suffix: "건",
        hint: `실패율 ${deliveryFailureRate}%`,
        tone: failureTone,
        href: "/admin/alimtalk",
      },
    ],
  };
}

export async function getAdminPersonalizationStatus(): Promise<PersonalizationStatusSummary> {
  const admin = createAdminClient();
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    profileTotal,
    profileReady,
    activeRules,
    autoRules,
    deliveries24h,
    sent24h,
    failed24h,
    queued24h,
  ] = await Promise.all([
    admin.from("user_profiles").select("id", { count: "exact", head: true }),
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .not("region", "is", null),
    admin
      .from("user_alert_rules")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin
      .from("user_alert_rules")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_auto_generated", true),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24hIso),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", since24hIso),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24hIso),
    admin
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .gte("created_at", since24hIso),
  ]);

  return buildPersonalizationStatusSummary({
    profileTotal: countOrZero("profileTotal", profileTotal),
    profileReady: countOrZero("profileReady", profileReady),
    activeRules: countOrZero("activeRules", activeRules),
    autoRules: countOrZero("autoRules", autoRules),
    deliveries24h: countOrZero("deliveries24h", deliveries24h),
    sent24h: countOrZero("sent24h", sent24h),
    failed24h: countOrZero("failed24h", failed24h),
    queued24h: countOrZero("queued24h", queued24h),
  });
}
