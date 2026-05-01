import { getAuthUsersCached } from "@/lib/admin-stats";
import { createAdminClient } from "@/lib/supabase/admin";

export type FunnelHealthCounts = {
  signups24h: number;
  signups7d: number;
  profileSaves24h: number;
  profileSaves7d: number;
  alertRules24h: number;
  alertRules7d: number;
  active7d: number;
};

export type FunnelMetric = {
  key:
    | "signup_completed"
    | "profile_saved"
    | "alert_rule_created"
    | "active_7d";
  label: string;
  value24h: number;
  value7d: number;
  hint: string;
  conversionLabel: string | null;
  conversionRate: number | null;
  tone: "ok" | "warn" | "info";
};

export type FunnelSummary = {
  tone: "ok" | "warn";
  message: string;
};

const ACTIVE_7D_FLOOR = 5;
const COMPLETED_PROFILE_FILTER =
  "age_group.not.is.null,region.not.is.null,occupation.not.is.null,income_level.not.is.null";

function conversionRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

function metricTone(value24h: number, conversion: number | null): FunnelMetric["tone"] {
  if (conversion === null) return "info";
  if (value24h === 0 || conversion < 20) return "warn";
  return "ok";
}

export function buildFunnelMetrics(counts: FunnelHealthCounts): FunnelMetric[] {
  const profileConversion = conversionRate(
    counts.profileSaves24h,
    counts.signups24h,
  );
  const alertConversion = conversionRate(
    counts.alertRules24h,
    counts.profileSaves24h,
  );

  return [
    {
      key: "signup_completed",
      label: "가입 완료",
      value24h: counts.signups24h,
      value7d: counts.signups7d,
      hint: "auth.users 생성 기준",
      conversionLabel: null,
      conversionRate: null,
      tone: counts.signups24h === 0 ? "warn" : "ok",
    },
    {
      key: "profile_saved",
      label: "프로필 저장",
      value24h: counts.profileSaves24h,
      value7d: counts.profileSaves7d,
      hint: "핵심 필드 저장 기준",
      conversionLabel: "가입 대비",
      conversionRate: profileConversion,
      tone: metricTone(counts.profileSaves24h, profileConversion),
    },
    {
      key: "alert_rule_created",
      label: "알림 규칙 생성",
      value24h: counts.alertRules24h,
      value7d: counts.alertRules7d,
      hint: "user_alert_rules 생성 기준",
      conversionLabel: "프로필 대비",
      conversionRate: alertConversion,
      tone: metricTone(counts.alertRules24h, alertConversion),
    },
    {
      key: "active_7d",
      label: "7d 활성 사용자",
      value24h: counts.active7d,
      value7d: counts.active7d,
      hint: "last_sign_in_at 7일 이내",
      conversionLabel: null,
      conversionRate: null,
      tone: counts.active7d < ACTIVE_7D_FLOOR ? "warn" : "ok",
    },
  ];
}

export function buildFunnelSummary(counts: FunnelHealthCounts): FunnelSummary {
  if (counts.signups24h === 0 && counts.active7d < ACTIVE_7D_FLOOR) {
    return {
      tone: "warn",
      message: `24h 신규 가입 0명, 7d 활성 ${counts.active7d}명입니다. 가입 funnel 점검이 필요합니다.`,
    };
  }

  return {
    tone: "ok",
    message: "가입 funnel 신호가 정상 범위입니다.",
  };
}

async function countCompletedProfiles(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
): Promise<number> {
  const byUpdatedAt = await admin
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .or(COMPLETED_PROFILE_FILTER)
    .gte("updated_at", sinceIso);

  if (!byUpdatedAt.error) return byUpdatedAt.count ?? 0;

  const missingUpdatedAt =
    byUpdatedAt.error.code === "42703" ||
    byUpdatedAt.error.message.includes("updated_at");
  if (!missingUpdatedAt) return 0;

  const byCreatedAt = await admin
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .or(COMPLETED_PROFILE_FILTER)
    .gte("created_at", sinceIso);

  return byCreatedAt.count ?? 0;
}

export async function getFunnelHealthCounts(): Promise<FunnelHealthCounts> {
  const admin = createAdminClient();
  const since24Iso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const allUsers = await getAuthUsersCached();
  const signups24h = allUsers.filter(
    (u) => u.created_at && u.created_at >= since24Iso,
  ).length;
  const signups7d = allUsers.filter(
    (u) => u.created_at && u.created_at >= since7dIso,
  ).length;
  const active7d = allUsers.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= since7dIso,
  ).length;

  const [profiles24h, profiles7d, alertRules24h, alertRules7d] =
    await Promise.all([
      countCompletedProfiles(admin, since24Iso),
      countCompletedProfiles(admin, since7dIso),
      admin
        .from("user_alert_rules")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24Iso),
      admin
        .from("user_alert_rules")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7dIso),
    ]);

  return {
    signups24h,
    signups7d,
    profileSaves24h: profiles24h,
    profileSaves7d: profiles7d,
    alertRules24h: alertRules24h.count ?? 0,
    alertRules7d: alertRules7d.count ?? 0,
    active7d,
  };
}

export async function getFunnelHealthSnapshot() {
  const counts = await getFunnelHealthCounts();
  return {
    counts,
    metrics: buildFunnelMetrics(counts),
    summary: buildFunnelSummary(counts),
  };
}
