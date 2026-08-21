import type { Tier } from "@/lib/subscription";

export type MypageWatchStatusStep = {
  label: string;
  done: boolean;
};

export type MypageWatchStatus = {
  headline: string;
  description: string;
  score: number;
  total: number;
  tone: "locked" | "setup" | "active";
  steps: MypageWatchStatusStep[];
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
};

export function buildMypageWatchStatus({
  tier,
  hasBusinessProfile,
  activeAlertRulesCount,
  savedDeadlineAlertsCount,
  hasKakaoConsent,
}: {
  tier: Tier;
  hasBusinessProfile: boolean;
  activeAlertRulesCount: number;
  savedDeadlineAlertsCount: number;
  hasKakaoConsent: boolean;
}): MypageWatchStatus {
  const isPaid = tier === "basic" || tier === "pro";
  const steps: MypageWatchStatusStep[] = [
    { label: "Basic 이상 구독", done: isPaid },
    { label: "사업자 프로필", done: hasBusinessProfile },
    { label: "맞춤 감시 조건", done: activeAlertRulesCount > 0 },
    { label: "정책별 마감 알림", done: savedDeadlineAlertsCount > 0 },
  ];

  if (tier === "pro") {
    steps.push({ label: "카카오 알림톡", done: hasKakaoConsent });
  }

  const score = steps.filter((step) => step.done).length;
  const total = steps.length;

  if (!isPaid) {
    return {
      headline: "정책 마감 감시가 꺼져 있어요",
      description: "Basic을 켜면 내 조건에 맞는 새 정책과 마감 임박 정책을 계속 감시할 수 있어요.",
      score,
      total,
      tone: "locked",
      steps,
      primaryAction: { label: "Basic으로 감시 켜기", href: "/pricing?from=mypage-watch&recommended=basic" },
      secondaryAction: { label: "정책 둘러보기", href: "/recommend?from=mypage-watch" },
    };
  }

  if (!hasBusinessProfile) {
    return {
      headline: "내 가게 정보가 없어 감시 정확도가 낮아요",
      description: "업종·지역·사업기간을 저장하면 받을 가능성 높은 정책부터 감시할 수 있어요.",
      score,
      total,
      tone: "setup",
      steps,
      primaryAction: { label: "사업자 프로필 입력", href: "/mypage/business?from=mypage-watch" },
      secondaryAction: { label: "감시 리포트 보기", href: "/alerts?from=mypage-watch" },
    };
  }

  if (activeAlertRulesCount <= 0 && savedDeadlineAlertsCount <= 0) {
    return {
      headline: "구독은 켜졌고, 감시할 조건만 남았어요",
      description: "관심 지역·업종·키워드 조건이나 정책별 마감 알림을 1개 이상 저장하세요.",
      score,
      total,
      tone: "setup",
      steps,
      primaryAction: { label: "감시 조건 만들기", href: "/mypage/notifications?from=mypage-watch" },
      secondaryAction: { label: "추천 정책 보기", href: "/recommend?from=mypage-watch" },
    };
  }

  return {
    headline: "내 정책 마감 감시가 작동 중이에요",
    description: `${activeAlertRulesCount}개 맞춤 조건과 ${savedDeadlineAlertsCount}개 정책별 알림을 기준으로 놓칠 수 있는 공고를 확인합니다.`,
    score,
    total,
    tone: "active",
    steps,
    primaryAction: { label: "이번 주 감시 리포트", href: "/alerts?from=mypage-watch" },
    secondaryAction: { label: "조건 관리", href: "/mypage/notifications?from=mypage-watch" },
  };
}
