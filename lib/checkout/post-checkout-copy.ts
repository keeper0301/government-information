import type { Tier } from "@/lib/subscription";

export type ActivationAction = {
  href: string;
  label: string;
  description: string;
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
      title: "프로 마감 감시를 바로 켜볼까요?",
      description: "카카오 알림톡과 맞춤 알림을 먼저 연결하면, 결제 직후부터 프로 플랜의 차이를 가장 빨리 확인할 수 있어요.",
      actions: [
        {
          href: "/mypage?from=checkout-activation#consents",
          label: "카카오 알림톡 동의 켜기",
          description: "긴급 공고와 마감 임박 정책을 이메일보다 빠르게 확인할 수 있게 합니다.",
          analyticsAction: "kakao_consent",
          tone: "primary",
        },
        {
          href: "/mypage/notifications?from=checkout-activation",
          label: "감시 조건 1개 저장하기",
          description: "지역·업종·관심 키워드를 저장해 키피오가 새 정책을 계속 확인하게 만듭니다.",
          analyticsAction: "notifications",
          tone: "secondary",
        },
      ],
    };
  }

  return {
    title: "베이직 마감 감시를 바로 켜볼까요?",
    description: "사업자 정보를 채우면 사장님 자격 진단과 마감 이메일 알림을 더 정확하게 받을 수 있어요.",
    actions: [
      {
        href: "/mypage/business?from=checkout-activation",
        label: "사업자 프로필 입력하기",
        description: "업종·지역·사업기간을 저장해 받을 가능성 높은 정책을 먼저 보게 합니다.",
        analyticsAction: "business_profile",
        tone: "primary",
      },
      {
        href: "/mypage/notifications?from=checkout-activation",
        label: "감시 조건 1개 저장하기",
        description: "마감 7일 전 이메일 알림을 받을 조건을 최소 1개 켭니다.",
        analyticsAction: "notifications",
        tone: "secondary",
      },
    ],
  };
}

export function getCheckoutRetryHref(tier: string | null | undefined): string {
  if (tier === "basic" || tier === "pro") return `/checkout?tier=${tier}`;
  return "/pricing";
}
