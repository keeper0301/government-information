export type UserActivationSummaryInput = {
  tier: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  hasBusinessProfile: boolean;
  hasKakaoConsent: boolean;
  activeAlertRulesCount: number;
  savedDeadlineAlertsCount: number;
  subscriptionCreatedAt?: string | null;
  nowIso?: string;
};

export type UserActivationSummary = {
  isPaid: boolean;
  isActivePaid: boolean;
  hasAnyWatch: boolean;
  activationAgeDays: number | null;
  isStaleNoWatch: boolean;
  statusLabel: string;
  gaps: string[];
  nextAction: string;
};

const ACTIVE_PAID_STATUSES = new Set(["trialing", "active", "charging", "manual_grant"]);

function daysSinceIso(iso: string | null | undefined, nowIso = new Date().toISOString()): number | null {
  if (!iso) return null;
  const elapsed = Date.parse(nowIso) - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.floor(elapsed / (24 * 60 * 60 * 1000));
}

export function buildUserActivationSummary(input: UserActivationSummaryInput): UserActivationSummary {
  const tier = input.tier ?? "free";
  const status = input.subscriptionStatus ?? "";
  const isPaid = tier === "basic" || tier === "pro";
  const isActivePaid = isPaid && ACTIVE_PAID_STATUSES.has(status);
  const hasAnyWatch = input.activeAlertRulesCount > 0 || input.savedDeadlineAlertsCount > 0;
  const activationAgeDays = daysSinceIso(input.subscriptionCreatedAt, input.nowIso);
  const isStaleNoWatch = isActivePaid && !hasAnyWatch && (activationAgeDays ?? 0) >= 1;
  const gaps: string[] = [];

  if (!input.hasBusinessProfile) gaps.push("사업자/프로필 없음");
  if (tier === "pro" && !input.hasKakaoConsent) gaps.push("카카오 동의 없음");
  if (input.activeAlertRulesCount === 0) gaps.push("맞춤 알림 규칙 없음");
  if (input.savedDeadlineAlertsCount === 0) gaps.push("정책 상세 마감 알림 없음");
  if (!hasAnyWatch) gaps.push("감시 설정 0개");

  if (!isPaid) {
    return {
      isPaid,
      isActivePaid,
      hasAnyWatch,
      activationAgeDays,
      isStaleNoWatch,
      statusLabel: "무료/미구독",
      gaps,
      nextAction: "유료 전환 전이면 pricing CTA·정책 상세 저장 CTA 경로를 확인하세요.",
    };
  }

  if (!isActivePaid) {
    return {
      isPaid,
      isActivePaid,
      hasAnyWatch,
      activationAgeDays,
      isStaleNoWatch,
      statusLabel: "결제/구독 상태 확인 필요",
      gaps,
      nextAction: "구독 상태와 Toss 결제 이력을 먼저 확인하세요.",
    };
  }

  if (!hasAnyWatch) {
    return {
      isPaid,
      isActivePaid,
      hasAnyWatch,
      activationAgeDays,
      isStaleNoWatch,
      statusLabel: isStaleNoWatch ? "24h+ 감시 0개" : "유료지만 감시 0개",
      gaps,
      nextAction: isStaleNoWatch
        ? "가입 후 24시간이 지났는데 감시가 0개입니다. 우선 연락해 알림센터 또는 정책 상세 저장 CTA에서 첫 감시를 켜도록 안내하세요."
        : "알림센터에서 맞춤 알림 규칙 또는 정책 상세 마감 알림을 1개 이상 설정하도록 안내하세요.",
    };
  }

  if (gaps.length > 0) {
    return {
      isPaid,
      isActivePaid,
      hasAnyWatch,
      activationAgeDays,
      isStaleNoWatch,
      statusLabel: "일부 설정 누락",
      gaps,
      nextAction: "이미 감시는 켜졌습니다. 남은 프로필/동의/알림 설정만 보완하면 됩니다.",
    };
  }

  return {
    isPaid,
    isActivePaid,
    hasAnyWatch,
    activationAgeDays,
    isStaleNoWatch,
    statusLabel: "활성화 완료",
    gaps,
    nextAction: "첫 알림 발송 이력과 정책 매칭 품질을 확인하세요.",
  };
}
