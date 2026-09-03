import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUsersCached } from "@/lib/admin-stats";
import { TIER_PRICES } from "@/lib/subscription";

export const PAID_ACTIVE_STATUSES = [
  "trialing",
  "active",
  "charging",
  "manual_grant",
] as const;

const PAID_TIERS = ["basic", "pro"] as const;

type PaidTier = (typeof PAID_TIERS)[number];

type SubscriptionRow = {
  user_id: string;
  tier: PaidTier;
  status: string;
  customer_email: string | null;
  card_company: string | null;
  card_number_masked: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  user_id: string;
  tier: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type AuthUserLite = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

export type PaidUserActivationGap =
  | "business_profile"
  | "kakao_consent"
  | "notifications";

export type PaidUserDashboardRow = {
  userId: string;
  email: string | null;
  tier: PaidTier;
  status: string;
  isActive: boolean;
  customerEmail: string | null;
  cardLabel: string | null;
  signupAt: string | null;
  lastSignInAt: string | null;
  subscriptionCreatedAt: string;
  subscriptionUpdatedAt: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAmount: number | null;
  lastPaymentAt: string | null;
  activeAlertRulesCount: number;
  savedDeadlineAlertsCount: number;
  activationGaps: PaidUserActivationGap[];
  activationAgeDays: number;
  staleNoWatch: boolean;
  recentPending24h: boolean;
  stalePendingOver24h: boolean;
  interviewSegment: "basic" | "pro" | "activation_gap" | "stale_no_watch" | "payment_risk";
};

export type PaidUsersDashboard = {
  stats: {
    totalPaidRows: number;
    activeTotal: number;
    activeBasic: number;
    activePro: number;
    trialing: number;
    pastDue: number;
    cancelled: number;
    monthlyRevenueEstimate: number;
    activationGapUsers: number;
    staleNoWatchUsers: number;
    pending24hUsers: number;
    pendingOver24hUsers: number;
    missingBusinessProfile: number;
    missingProKakaoConsent: number;
    missingAlertRules: number;
    missingDeadlineAlerts: number;
    missingAnyAlertWatch: number;
  };
  rows: PaidUserDashboardRow[];
};

export type ActivationGapActionCard = {
  key: "stale_no_watch" | "activation_gap" | "pending_checkout" | "payment_risk";
  title: string;
  count: number;
  href: string;
  tone: "red" | "amber" | "blue";
  description: string;
  copyHint: string;
};

export type PaidUsersFilter = {
  tier?: string;
  status?: string;
  segment?: string;
  query?: string;
};

export const PAID_USERS_CSV_HEADER = [
  "email",
  "tier",
  "status",
  "interview_segment",
  "activation_gaps",
  "active_alert_rules_count",
  "saved_deadline_alerts_count",
  "no_watch_configured",
  "stale_no_watch",
  "pending_24h",
  "pending_over_24h",
  "activation_age_days",
  "last_sign_in_at",
  "current_period_end",
  "admin_user_url",
  "outreach_message_type",
] as const;

export function isPaidActiveStatus(status: string): boolean {
  return (PAID_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function filterPaidUserRows(
  rows: PaidUserDashboardRow[],
  filters: PaidUsersFilter,
): PaidUserDashboardRow[] {
  const tier = filters.tier ?? "";
  const status = filters.status ?? "";
  const segment = filters.segment ?? "";
  const query = (filters.query ?? "").trim().toLowerCase();

  return rows.filter((row) => {
    if (tier && row.tier !== tier) return false;
    if (status && row.status !== status) return false;
    if (segment === "no_watch" && !hasNoWatchConfigured(row)) return false;
    if (segment === "stale_no_watch" && !row.staleNoWatch) return false;
    if (segment === "pending_checkout" && !row.recentPending24h && !row.stalePendingOver24h) return false;
    if (segment === "pending_24h" && !row.recentPending24h) return false;
    if (segment === "pending_over_24h" && !row.stalePendingOver24h) return false;
    if (segment && segment !== "no_watch" && segment !== "stale_no_watch" && segment !== "pending_checkout" && segment !== "pending_24h" && segment !== "pending_over_24h" && row.interviewSegment !== segment) return false;
    if (!query) return true;

    const haystack = [row.email, row.customerEmail, row.userId, row.cardLabel]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function hasNoWatchConfigured(row: Pick<PaidUserDashboardRow, "activeAlertRulesCount" | "savedDeadlineAlertsCount">): boolean {
  return row.activeAlertRulesCount === 0 && row.savedDeadlineAlertsCount === 0;
}

export function buildActivationGapActionCards(dashboard: Pick<PaidUsersDashboard, "stats" | "rows">): ActivationGapActionCard[] {
  const stats = dashboard.stats;
  const setupGapUsers = dashboard.rows.filter(
    (row) => row.activationGaps.length > 0 && row.interviewSegment !== "payment_risk",
  ).length;
  return [
    {
      key: "stale_no_watch",
      title: "오늘 먼저 연락",
      count: stats.staleNoWatchUsers,
      href: "/admin/paid-users?segment=stale_no_watch",
      tone: "red",
      description: "유료 플랜 시작 후 24시간이 지났지만 맞춤 규칙·정책 마감 감시가 모두 0개인 사용자입니다.",
      copyHint: "알림센터 또는 정책 상세 저장 CTA에서 첫 감시 1개를 켜도록 안내하세요.",
    },
    {
      key: "activation_gap",
      title: "프로필·알림 미완료",
      count: setupGapUsers,
      href: "/admin/paid-users?segment=activation_gap",
      tone: "amber",
      description: "사업자 정보, Pro 카카오 동의, 알림 조건 중 하나라도 비어 있는 유료 사용자입니다.",
      copyHint: "미설정 항목을 확인하고 10분 인터뷰 또는 설정 안내 후보로 분류하세요.",
    },
    {
      key: "pending_checkout",
      title: "카드 등록 이탈",
      count: stats.pending24hUsers + stats.pendingOver24hUsers,
      href: "/admin/paid-users?segment=pending_checkout",
      tone: "amber",
      description: "Basic/Pro 결제 시작 후 아직 카드 등록이 완료되지 않은 사용자입니다.",
      copyHint: "가격·기능 설명 부족인지, 결제 오류인지 먼저 확인하세요.",
    },
    {
      key: "payment_risk",
      title: "결제/해지 위험",
      count: stats.pastDue + stats.cancelled,
      href: "/admin/paid-users?segment=payment_risk",
      tone: "blue",
      description: "결제 실패 또는 해지 상태라 활성화 안내보다 결제/해지 경험 확인이 먼저인 사용자입니다.",
      copyHint: "결제 유도보다 막힌 지점 확인용으로 접근하세요.",
    },
  ];
}

export type OutreachMessageType = "payment_risk" | "pending_over_24h" | "pending_24h" | "stale_no_watch" | "activation_gap" | "paid_user";

export function outreachMessageType(
  row: PaidUserDashboardRow,
): OutreachMessageType {
  if (row.interviewSegment === "payment_risk") return "payment_risk";
  if (row.stalePendingOver24h) return "pending_over_24h";
  if (row.recentPending24h) return "pending_24h";
  if (row.interviewSegment === "stale_no_watch") return "stale_no_watch";
  if (row.interviewSegment === "activation_gap") return "activation_gap";
  return "paid_user";
}

export function outreachMessageTypeLabel(type: OutreachMessageType): string {
  const labels: Record<OutreachMessageType, string> = {
    paid_user: "유료 사용자 섭외",
    pending_over_24h: "오래된 카드 등록 이탈 확인",
    pending_24h: "카드 등록 전 이탈 확인",
    stale_no_watch: "24h+ 감시 0개 확인",
    activation_gap: "미설정 사용자 섭외",
    payment_risk: "결제/해지 위험 확인",
  };
  return labels[type];
}

export function buildPaidUserOutreachMessage(row: PaidUserDashboardRow): string {
  const type = outreachMessageType(row);
  const tierName = row.tier === "pro" ? "Pro" : "Basic";
  const emailLine = row.email ? `\n\n대상: ${row.email}` : "";

  if (type === "pending_24h") {
    return [
      "안녕하세요, 정책알리미 운영자입니다.",
      `${tierName} 결제 시작 화면까지 오셨는데 카드 등록이 아직 완료되지 않은 것 같아 확인차 연락드립니다.`,
      "결제 오류인지, 가격/기능 설명이 부족했는지, 아니면 아직 고민 중이신지 짧게 확인하고 싶습니다.",
      "불편했던 지점이 있으면 바로 개선에 반영하겠습니다.",
      emailLine.trimStart(),
    ].filter(Boolean).join("\n");
  }

  if (type === "pending_over_24h") {
    return [
      "안녕하세요, 정책알리미 운영자입니다.",
      `${tierName} 결제 시작 화면까지 오신 뒤 카드 등록이 ${row.activationAgeDays}일째 완료되지 않아 확인차 연락드립니다.`,
      "결제 오류인지, 카드 등록 흐름이 헷갈렸는지, 가격이나 기능 설명이 부족했는지 짧게 확인하고 싶습니다.",
      "불편했던 지점이 있으면 바로 개선에 반영하겠습니다.",
      emailLine.trimStart(),
    ].filter(Boolean).join("\n");
  }

  if (type === "stale_no_watch") {
    return [
      "안녕하세요, 정책알리미 운영자입니다.",
      `${tierName} 유료 플랜을 시작하신 뒤 아직 정책 마감 감시가 켜지지 않은 것 같아 확인차 연락드립니다.`,
      `현재 맞춤 알림 규칙 0개, 정책 상세 마감 알림 0개로 보이고 가입 후 ${row.activationAgeDays}일이 지났습니다.`,
      "알림센터 설정 과정에서 막힌 부분이 있었는지, 어떤 알림이 필요했는지 5~10분만 여쭤보고 싶습니다.",
      "가능하신 시간 편하게 알려주세요.",
      emailLine.trimStart(),
    ].filter(Boolean).join("\n");
  }

  if (type === "activation_gap") {
    const gaps = row.activationGaps.map(activationGapLabel).join(", ");
    return [
      "안녕하세요, 정책알리미 운영자입니다.",
      `${tierName} 유료 플랜을 시작하신 뒤 아직 일부 설정이 완료되지 않은 것 같아,`,
      "혹시 어떤 부분이 막혔는지 10분만 여쭤보고 싶습니다.",
      gaps ? `현재 확인되는 미설정 항목은 ${gaps}입니다.` : "설정 과정에서 막힌 부분이 있었는지 확인하고 싶습니다.",
      "설명이 부족했는지, 필요성을 못 느끼셨는지 확인해서 바로 개선하려고 합니다.",
      "가능하신 시간 편하게 알려주세요.",
      emailLine.trimStart(),
    ].filter(Boolean).join("\n");
  }

  if (type === "payment_risk") {
    return [
      "안녕하세요, 정책알리미 운영자입니다.",
      `${tierName} 플랜 이용 과정에서 결제 상태나 해지 흐름에 불편이 있었는지 확인하고 있습니다.`,
      "결제 유도 목적이 아니라, 막힌 지점을 고치기 위한 5~10분 확인입니다.",
      "불편했던 점이나 계속 쓰기 어려웠던 이유를 솔직하게 들려주시면 바로 개선에 반영하겠습니다.",
      "가능하신 시간 편하게 알려주세요.",
      emailLine.trimStart(),
    ].filter(Boolean).join("\n");
  }

  return [
    "안녕하세요, 정책알리미 운영자입니다.",
    `최근 ${tierName} 유료 플랜을 시작해주셔서 정말 감사합니다.`,
    "서비스를 더 쉽게 만들기 위해 10분 정도 짧게 통화로 의견을 듣고 있어요.",
    "좋은 말보다 “헷갈렸던 점·아쉬웠던 점”을 듣고 싶습니다.",
    "가능하신 시간 알려주시면 맞춰서 연락드리겠습니다.",
    emailLine.trimStart(),
  ].filter(Boolean).join("\n");
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildPaidUsersCsv(
  rows: PaidUserDashboardRow[],
  options: { baseUrl?: string } = {},
): string {
  const baseUrl = options.baseUrl ? trimTrailingSlash(options.baseUrl) : "";
  const lines = [PAID_USERS_CSV_HEADER.map(csvCell).join(",")];

  for (const row of rows) {
    const adminPath = `/admin/users/${row.userId}`;
    lines.push(
      [
        row.email ?? "",
        row.tier,
        row.status,
        row.interviewSegment,
        row.activationGaps.join("|"),
        row.activeAlertRulesCount,
        row.savedDeadlineAlertsCount,
        hasNoWatchConfigured(row) ? "yes" : "no",
        row.staleNoWatch ? "yes" : "no",
        row.recentPending24h ? "yes" : "no",
        row.stalePendingOver24h ? "yes" : "no",
        row.activationAgeDays,
        row.lastSignInAt ?? "",
        row.currentPeriodEnd ?? "",
        baseUrl ? `${baseUrl}${adminPath}` : adminPath,
        outreachMessageType(row),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return "﻿" + lines.join("\r\n");
}

export function getActivationGaps(input: {
  tier: PaidTier;
  hasBusinessProfile: boolean;
  hasKakaoConsent: boolean;
  hasActiveAlertRule: boolean;
  hasSavedDeadlineAlert?: boolean;
}): PaidUserActivationGap[] {
  const gaps: PaidUserActivationGap[] = [];
  if (!input.hasBusinessProfile) gaps.push("business_profile");
  if (input.tier === "pro" && !input.hasKakaoConsent) gaps.push("kakao_consent");
  if (!input.hasActiveAlertRule && !input.hasSavedDeadlineAlert) gaps.push("notifications");
  return gaps;
}

function chooseInterviewSegment(row: {
  tier: PaidTier;
  status: string;
  activationGaps: PaidUserActivationGap[];
  staleNoWatch: boolean;
}): PaidUserDashboardRow["interviewSegment"] {
  if (row.status === "pending") return "activation_gap";
  if (row.status === "past_due" || row.status === "cancelled") return "payment_risk";
  if (row.staleNoWatch) return "stale_no_watch";
  if (row.activationGaps.length > 0) return "activation_gap";
  return row.tier;
}

export function daysSinceIso(iso: string, nowIso = new Date().toISOString()): number {
  const elapsed = Date.parse(nowIso) - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.floor(elapsed / (24 * 60 * 60 * 1000));
}

export function buildPaidUsersDashboard(input: {
  subscriptions: SubscriptionRow[];
  users: AuthUserLite[];
  payments: PaymentRow[];
  businessUserIds: string[];
  kakaoConsentUserIds: string[];
  activeAlertRuleUserIds: string[];
  activeAlarmSubscriptionUserIds?: string[];
  nowIso?: string;
}): PaidUsersDashboard {
  const userMap = new Map(input.users.map((user) => [user.id, user]));
  const businessSet = new Set(input.businessUserIds);
  const kakaoSet = new Set(input.kakaoConsentUserIds);
  const alertRuleCounts = countByUserId(input.activeAlertRuleUserIds);
  const deadlineAlertCounts = countByUserId(input.activeAlarmSubscriptionUserIds ?? []);

  const latestPaymentByUser = new Map<string, PaymentRow>();
  for (const payment of input.payments) {
    const prev = latestPaymentByUser.get(payment.user_id);
    const currentAt = payment.paid_at ?? payment.created_at;
    const prevAt = prev ? prev.paid_at ?? prev.created_at : "";
    if (!prev || currentAt > prevAt) latestPaymentByUser.set(payment.user_id, payment);
  }

  const rows = input.subscriptions.map((subscription) => {
    const user = userMap.get(subscription.user_id);
    const payment = latestPaymentByUser.get(subscription.user_id) ?? null;
    const activationGaps = getActivationGaps({
      tier: subscription.tier,
      hasBusinessProfile: businessSet.has(subscription.user_id),
      hasKakaoConsent: kakaoSet.has(subscription.user_id),
      hasActiveAlertRule: (alertRuleCounts.get(subscription.user_id) ?? 0) > 0,
      hasSavedDeadlineAlert: (deadlineAlertCounts.get(subscription.user_id) ?? 0) > 0,
    });
    const isActive = isPaidActiveStatus(subscription.status);
    const activationAgeDays = daysSinceIso(subscription.created_at, input.nowIso);
    const hasAnyWatch = (alertRuleCounts.get(subscription.user_id) ?? 0) > 0 || (deadlineAlertCounts.get(subscription.user_id) ?? 0) > 0;
    const staleNoWatch = isActive && !hasAnyWatch && activationAgeDays >= 1;
    const recentPending24h = subscription.status === "pending" && activationAgeDays === 0;
    const stalePendingOver24h = subscription.status === "pending" && activationAgeDays >= 1;
    const cardLabel =
      subscription.card_company && subscription.card_number_masked
        ? `${subscription.card_company} · ${subscription.card_number_masked}`
        : null;
    const row = {
      userId: subscription.user_id,
      email: user?.email ?? subscription.customer_email ?? null,
      tier: subscription.tier,
      status: subscription.status,
      isActive,
      customerEmail: subscription.customer_email,
      cardLabel,
      signupAt: user?.created_at ?? null,
      lastSignInAt: user?.last_sign_in_at ?? null,
      subscriptionCreatedAt: subscription.created_at,
      subscriptionUpdatedAt: subscription.updated_at,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEnd: subscription.current_period_end,
      cancelledAt: subscription.cancelled_at,
      lastPaymentStatus: payment?.status ?? null,
      lastPaymentAmount: payment?.amount ?? null,
      lastPaymentAt: payment ? payment.paid_at ?? payment.created_at : null,
      activeAlertRulesCount: alertRuleCounts.get(subscription.user_id) ?? 0,
      savedDeadlineAlertsCount: deadlineAlertCounts.get(subscription.user_id) ?? 0,
      activationGaps,
      activationAgeDays,
      staleNoWatch,
      recentPending24h,
      stalePendingOver24h,
      interviewSegment: "basic" as PaidUserDashboardRow["interviewSegment"],
    } satisfies PaidUserDashboardRow;
    return { ...row, interviewSegment: chooseInterviewSegment(row) };
  });

  rows.sort((a, b) => {
    const aKey = a.subscriptionUpdatedAt ?? a.subscriptionCreatedAt;
    const bKey = b.subscriptionUpdatedAt ?? b.subscriptionCreatedAt;
    return bKey.localeCompare(aKey);
  });

  const activeRows = rows.filter((row) => row.isActive);
  const stats = {
    totalPaidRows: rows.length,
    activeTotal: activeRows.length,
    activeBasic: activeRows.filter((row) => row.tier === "basic").length,
    activePro: activeRows.filter((row) => row.tier === "pro").length,
    trialing: rows.filter((row) => row.status === "trialing").length,
    pastDue: rows.filter((row) => row.status === "past_due").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    monthlyRevenueEstimate: activeRows.reduce(
      (sum, row) => sum + TIER_PRICES[row.tier],
      0,
    ),
    activationGapUsers: rows.filter((row) => row.activationGaps.length > 0).length,
    staleNoWatchUsers: rows.filter((row) => row.staleNoWatch).length,
    pending24hUsers: rows.filter((row) => row.recentPending24h).length,
    pendingOver24hUsers: rows.filter((row) => row.stalePendingOver24h).length,
    missingBusinessProfile: rows.filter((row) =>
      row.activationGaps.includes("business_profile"),
    ).length,
    missingProKakaoConsent: rows.filter((row) =>
      row.activationGaps.includes("kakao_consent"),
    ).length,
    missingAlertRules: rows.filter((row) =>
      row.activeAlertRulesCount === 0,
    ).length,
    missingDeadlineAlerts: rows.filter((row) =>
      row.savedDeadlineAlertsCount === 0,
    ).length,
    missingAnyAlertWatch: rows.filter((row) =>
      row.activationGaps.includes("notifications"),
    ).length,
  };

  return { stats, rows };
}

function countByUserId(userIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const userId of userIds) {
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return counts;
}

export async function getPaidUsersDashboard(): Promise<PaidUsersDashboard> {
  const admin = createAdminClient();
  const [users, { data: subscriptions }, { data: payments }] = await Promise.all([
    getAuthUsersCached(),
    admin
      .from("subscriptions")
      .select(
        "user_id, tier, status, customer_email, card_company, card_number_masked, trial_ends_at, current_period_end, cancelled_at, created_at, updated_at",
      )
      .in("tier", PAID_TIERS)
      .order("updated_at", { ascending: false }),
    admin
      .from("payment_history")
      .select("user_id, tier, amount, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const paidUserIds = (subscriptions ?? []).map((row) => row.user_id as string);
  if (paidUserIds.length === 0) {
    return buildPaidUsersDashboard({
      subscriptions: [],
      users,
      payments: [],
      businessUserIds: [],
      kakaoConsentUserIds: [],
      activeAlertRuleUserIds: [],
      activeAlarmSubscriptionUserIds: [],
    });
  }

  const [{ data: businessProfiles }, { data: kakaoConsents }, { data: alertRules }, { data: deadlineAlerts }] =
    await Promise.all([
      admin
        .from("business_profiles")
        .select("user_id")
        .in("user_id", paidUserIds),
      admin
        .from("user_latest_consent")
        .select("user_id")
        .in("user_id", paidUserIds)
        .eq("consent_type", "kakao_messaging")
        .eq("is_active", true),
      admin
        .from("user_alert_rules")
        .select("user_id")
        .in("user_id", paidUserIds)
        .eq("is_active", true),
      admin
        .from("alarm_subscriptions")
        .select("user_id")
        .in("user_id", paidUserIds)
        .eq("is_active", true),
    ]);

  return buildPaidUsersDashboard({
    subscriptions: (subscriptions ?? []) as SubscriptionRow[],
    users,
    payments: (payments ?? []) as PaymentRow[],
    businessUserIds: [...new Set((businessProfiles ?? []).map((row) => row.user_id as string))],
    kakaoConsentUserIds: [...new Set((kakaoConsents ?? []).map((row) => row.user_id as string))],
    activeAlertRuleUserIds: (alertRules ?? []).map((row) => row.user_id as string),
    activeAlarmSubscriptionUserIds: (deadlineAlerts ?? []).map((row) => row.user_id as string),
  });
}

export function activationGapLabel(gap: PaidUserActivationGap): string {
  const labels: Record<PaidUserActivationGap, string> = {
    business_profile: "사업자 정보 없음",
    kakao_consent: "카카오 동의 없음",
    notifications: "알림 조건 없음",
  };
  return labels[gap];
}

export function interviewSegmentLabel(segment: PaidUserDashboardRow["interviewSegment"]): string {
  const labels: Record<PaidUserDashboardRow["interviewSegment"], string> = {
    basic: "Basic 인터뷰",
    pro: "Pro 인터뷰",
    activation_gap: "미설정 인터뷰",
    stale_no_watch: "24h+ 감시 0개",
    payment_risk: "결제/해지 위험",
  };
  return labels[segment];
}
