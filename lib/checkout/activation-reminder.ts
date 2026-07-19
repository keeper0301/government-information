import type { Tier } from "@/lib/subscription";

export type ActivationReminderAction =
  | "business_profile"
  | "kakao_consent"
  | "notifications";

export type ActivationReminder = {
  action: ActivationReminderAction;
  href: string;
  title: string;
  description: string;
  ctaLabel: string;
};

export function getActivationReminder({
  tier,
  hasBusinessProfile,
  hasKakaoConsent,
  hasActiveAlertRule,
}: {
  tier: Tier;
  hasBusinessProfile: boolean;
  hasKakaoConsent: boolean;
  hasActiveAlertRule: boolean;
}): ActivationReminder | null {
  if (tier !== "basic" && tier !== "pro") return null;

  if (!hasBusinessProfile) {
    return {
      action: "business_profile",
      href: "/mypage/business",
      title: "아직 내 가게 정보가 비어 있어요",
      description: "사업자 정보를 입력하면 사장님 조건에 맞는 정책 자격 진단과 추천 정확도가 올라가요.",
      ctaLabel: "사업자 정보 입력하기",
    };
  }

  if (tier === "pro" && !hasKakaoConsent) {
    return {
      action: "kakao_consent",
      href: "/mypage#consents",
      title: "프로 핵심 기능인 카카오 알림톡을 켜주세요",
      description: "카카오 알림톡 동의를 켜야 맞춤 정책을 더 빠르게 받아볼 수 있어요.",
      ctaLabel: "카카오 동의 켜기",
    };
  }

  if (!hasActiveAlertRule) {
    return {
      action: "notifications",
      href: "/mypage/notifications",
      title: "아직 알림 조건이 설정되지 않았어요",
      description: "관심 지역·대상·키워드를 저장하면 새 정책을 놓치지 않도록 알려드려요.",
      ctaLabel: "알림 조건 설정하기",
    };
  }

  return null;
}
