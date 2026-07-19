import type { Tier } from "@/lib/subscription";

export type ActivationAction = {
  href: string;
  label: string;
  analyticsAction: "business_profile" | "kakao_consent" | "notifications";
  tone: "primary" | "secondary";
};

export type PostCheckoutActivationCopy = {
  title: string;
  description: string;
  actions: ActivationAction[];
};

export function getPostCheckoutActivationCopy(
  tier: Exclude<Tier, "free">,
): PostCheckoutActivationCopy {
  if (tier === "pro") {
    return {
      title: "프로 기능을 바로 켜볼까요?",
      description: "카카오 알림톡과 맞춤 알림을 먼저 연결하면, 결제 직후부터 프로 플랜의 차이를 가장 빨리 확인할 수 있어요.",
      actions: [
        { href: "/mypage#consents", label: "카카오 동의 켜기", analyticsAction: "kakao_consent", tone: "primary" },
        { href: "/mypage/notifications", label: "알림 조건 설정하기", analyticsAction: "notifications", tone: "secondary" },
      ],
    };
  }

  return {
    title: "베이직 기능을 바로 시작해볼까요?",
    description: "사업자 정보를 채우면 사장님 자격 진단과 마감 이메일 알림을 더 정확하게 받을 수 있어요.",
    actions: [
      { href: "/mypage/business", label: "사업자 정보 입력하기", analyticsAction: "business_profile", tone: "primary" },
      { href: "/mypage/notifications", label: "이메일 알림 설정하기", analyticsAction: "notifications", tone: "secondary" },
    ],
  };
}

export function getCheckoutRetryHref(tier: string | null | undefined): string {
  if (tier === "basic" || tier === "pro") return `/checkout?tier=${tier}`;
  return "/pricing";
}
