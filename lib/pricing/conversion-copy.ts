import type { RecommendedTier } from "@/lib/pricing/recommended-tier";
import type { Tier } from "@/lib/subscription";

export type PricingSource =
  | "mypage"
  | "notifications"
  | "search"
  | "alerts"
  | "business"
  | "instagram"
  | "threads"
  | "seo"
  | "naver"
  | null;
export type PricingVariant = "default" | "notifications_pro_fast_alerts" | "business_basic_auto_judgment";

export type PricingConversionCopy = {
  source: PricingSource;
  recommendedTier: RecommendedTier;
  variant: PricingVariant;
  heading: string;
  subheading: string;
  planNudgeByTier: Partial<Record<Extract<Tier, "basic" | "pro">, string>>;
  ctaLabelByTier: Partial<Record<Extract<Tier, "basic" | "pro">, string>>;
};

const DEFAULT_COPY: PricingConversionCopy = {
  source: null,
  recommendedTier: null,
  variant: "default",
  heading: "사장님 정책 마감, 놓치지 않게 챙겨드릴게요",
  subheading: "지역·업종·사업자 정보를 기준으로 받을 가능성 높은 지원금·대출·세금 혜택을 먼저 보여드려요.",
  planNudgeByTier: {
    basic: "내 사업자 조건에 맞는 정책을 저장하고, 마감 7일 전 이메일로 받아보는 첫 유료 플랜이에요.",
    pro: "알림톡/SMS와 신청 준비 체크리스트까지 필요한 사장님에게 맞는 플랜이에요.",
  },
  ctaLabelByTier: {
    basic: "내 정책 알림 시작하기",
    pro: "신청 준비까지 챙기기",
  },
};

export function parsePricingSource(
  searchParams: { from?: string | string[] } | null | undefined,
): PricingSource {
  const raw = Array.isArray(searchParams?.from) ? searchParams?.from[0] : searchParams?.from;
  if (
    raw === "mypage" ||
    raw === "notifications" ||
    raw === "search" ||
    raw === "alerts" ||
    raw === "business" ||
    raw === "instagram" ||
    raw === "threads" ||
    raw === "seo" ||
    raw === "naver"
  ) {
    return raw;
  }
  return null;
}

export function getPricingConversionCopy({
  source,
  recommendedTier,
}: {
  source: PricingSource;
  recommendedTier: RecommendedTier;
}): PricingConversionCopy {
  if (source === "notifications" && recommendedTier === "pro") {
    return {
      source,
      recommendedTier,
      variant: "notifications_pro_fast_alerts",
      heading: "맞춤 정책을 카카오로 놓치지 마세요",
      subheading: "미리보기에서 조건에 맞는 정책을 확인했다면, 프로 플랜으로 새 정책을 더 빠르게 받아볼 수 있어요.",
      planNudgeByTier: {
        pro: "방금 본 알림 조건에 맞는 새 정책을 카카오 알림톡으로 받아보는 플랜이에요.",
      },
      ctaLabelByTier: {
        pro: "카카오 알림톡으로 놓치지 않기",
      },
    };
  }

  if (source === "business" && recommendedTier === "basic") {
    return {
      source,
      recommendedTier,
      variant: "business_basic_auto_judgment",
      heading: "내 가게에 맞는 정책을 자동으로 챙겨보세요",
      subheading: "사업자 정보를 기준으로 자격을 진단하고, 마감 임박 정책을 이메일로 받을 수 있어요.",
      planNudgeByTier: {
        basic: "사업자 조건을 기준으로 사장님 자격 진단과 이메일 알림을 시작하는 플랜이에요.",
      },
      ctaLabelByTier: {
        basic: "자격 진단 시작하기",
      },
    };
  }

  return {
    ...DEFAULT_COPY,
    source,
    recommendedTier,
  };
}
