import type { Tier } from "@/lib/subscription";
import { buildBasicPricingHref, buildProPricingHref } from "@/lib/pricing/cta-links";

export type AlertReliabilityAction = {
  label: string;
  href: string;
  tone: "primary" | "secondary";
};

export type AlertReliabilityStep = {
  key: "plan" | "business_profile" | "alert_rule" | "email" | "kakao";
  label: string;
  done: boolean;
  description: string;
};

export type AlertReliabilitySummary = {
  score: number;
  total: number;
  headline: string;
  subheadline: string;
  steps: AlertReliabilityStep[];
  primaryAction: AlertReliabilityAction;
};

export function buildAlertReliabilitySummary({
  tier,
  hasBusinessProfile,
  activeAlertRulesCount,
  hasEmail,
  hasKakaoConsent,
}: {
  tier: Tier;
  hasBusinessProfile: boolean;
  activeAlertRulesCount: number;
  hasEmail: boolean;
  hasKakaoConsent: boolean;
}): AlertReliabilitySummary {
  const isPaid = tier === "basic" || tier === "pro";
  const requiresKakao = tier === "pro";
  const steps: AlertReliabilityStep[] = [
    {
      key: "plan",
      label: "Basic 이상 구독",
      done: isPaid,
      description: isPaid
        ? "마감 알림 기능을 쓸 수 있는 상태예요."
        : "사업자 맞춤 마감 알림은 Basic부터 켜집니다.",
    },
    {
      key: "business_profile",
      label: "사업자 프로필",
      done: hasBusinessProfile,
      description: hasBusinessProfile
        ? "내 업종·지역 기준으로 정책을 좁힐 수 있어요."
        : "업종·지역을 넣어야 받을 정책을 덜 놓쳐요.",
    },
    {
      key: "alert_rule",
      label: "활성 알림 조건",
      done: activeAlertRulesCount > 0,
      description:
        activeAlertRulesCount > 0
          ? `${activeAlertRulesCount}개 조건을 감시 중이에요.`
          : "관심 지역·업종·키워드 조건을 1개 이상 저장하세요.",
    },
    {
      key: "email",
      label: "이메일 수신 경로",
      done: hasEmail,
      description: hasEmail
        ? "마감 7일 전 이메일을 받을 수 있어요."
        : "마감 알림을 받을 이메일이 필요해요.",
    },
  ];

  if (requiresKakao) {
    steps.push({
      key: "kakao",
      label: "카카오 알림톡 동의",
      done: hasKakaoConsent,
      description: hasKakaoConsent
        ? "긴급 공고를 카카오 알림톡으로 받을 수 있어요."
        : "Pro 알림톡을 받으려면 수신 동의가 필요해요.",
    });
  }

  const score = steps.filter((step) => step.done).length;
  const total = steps.length;

  let headline = "마감 감시 준비가 거의 끝났어요";
  let subheadline = "한 번만 설정해두면 새 공고와 마감 임박 정책을 계속 확인할 수 있어요.";
  let primaryAction: AlertReliabilityAction = {
    label: "알림 조건 설정하기",
    href: "/mypage/notifications",
    tone: "primary",
  };

  if (!isPaid) {
    headline = "아직 자동 마감 감시가 꺼져 있어요";
    subheadline = "키피오를 매일 열지 않아도 놓치지 않게 하려면 Basic 알림을 먼저 켜세요.";
    primaryAction = {
      label: "Basic으로 마감 감시 켜기",
      href: buildBasicPricingHref("alerts"),
      tone: "primary",
    };
  } else if (!hasBusinessProfile) {
    headline = "내 가게 정보가 비어 있어 추천이 넓게 잡혀요";
    subheadline = "업종·지역·사업기간을 저장하면 받을 가능성 높은 정책을 먼저 보게 됩니다.";
    primaryAction = {
      label: "사업자 프로필 입력하기",
      href: "/mypage/business?from=alerts-reliability",
      tone: "primary",
    };
  } else if (activeAlertRulesCount <= 0) {
    headline = "구독은 켜졌지만 감시 조건이 아직 없어요";
    subheadline = "조건 1개만 저장해도 새 정책과 마감 임박 알림을 받을 수 있어요.";
  } else if (tier === "pro" && !hasKakaoConsent) {
    headline = "이메일 감시는 켜졌고, 알림톡만 남았어요";
    subheadline = "카카오 동의를 켜면 긴급 공고를 더 빨리 확인할 수 있어요.";
    primaryAction = {
      label: "카카오 동의 켜기",
      href: "/mypage#consents",
      tone: "primary",
    };
  } else if (tier === "basic") {
    headline = "Basic 마감 감시가 작동 중이에요";
    subheadline = "긴급 공고를 카카오 알림톡으로도 받고 싶다면 Pro로 올리면 됩니다.";
    primaryAction = {
      label: "Pro 알림톡 보기",
      href: buildProPricingHref("alerts"),
      tone: "secondary",
    };
  } else {
    headline = "Pro 마감 감시가 작동 중이에요";
    subheadline = "이 상태를 유지하면 이메일과 알림톡으로 정책을 놓칠 가능성이 줄어듭니다.";
    primaryAction = {
      label: "감시 조건 관리하기",
      href: "/mypage/notifications",
      tone: "secondary",
    };
  }

  return { score, total, headline, subheadline, steps, primaryAction };
}
