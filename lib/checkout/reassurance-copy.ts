import type { Tier } from "@/lib/subscription";
import { parsePricingSource, type PricingSource, type PricingVariant } from "@/lib/pricing/conversion-copy";
import { parseRecommendedTier, type RecommendedTier } from "@/lib/pricing/recommended-tier";

export type CheckoutSearchParams = {
  source?: string | string[];
  recommended?: string | string[];
  pricing_variant?: string | string[];
};

export type CheckoutReassuranceCopy = {
  source: PricingSource;
  recommendedTier: RecommendedTier;
  pricingVariant: PricingVariant;
  title: string;
  description: string;
  benefits: string[];
};

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function parsePricingVariant(raw: string | string[] | undefined): PricingVariant {
  const value = first(raw);
  if (
    value === "notifications_pro_fast_alerts" ||
    value === "business_basic_auto_judgment" ||
    value === "default"
  ) {
    return value;
  }
  return "default";
}

export function buildCheckoutQuery({
  tier,
  source,
  recommendedTier,
  pricingVariant,
}: {
  tier: Exclude<Tier, "free">;
  source: PricingSource;
  recommendedTier: RecommendedTier;
  pricingVariant: PricingVariant;
}): string {
  const params = new URLSearchParams({ tier });
  if (source) params.set("source", source);
  if (recommendedTier) params.set("recommended", recommendedTier);
  if (pricingVariant !== "default") params.set("pricing_variant", pricingVariant);
  return `/checkout?${params.toString()}`;
}

export function getCheckoutReassuranceCopy({
  tier,
  searchParams,
}: {
  tier: Exclude<Tier, "free">;
  searchParams: CheckoutSearchParams | null | undefined;
}): CheckoutReassuranceCopy {
  const source = parsePricingSource({ from: searchParams?.source });
  const recommendedTier = parseRecommendedTier({ recommended: searchParams?.recommended });
  const pricingVariant = parsePricingVariant(searchParams?.pricing_variant);

  if (tier === "pro" && pricingVariant === "notifications_pro_fast_alerts") {
    return {
      source,
      recommendedTier,
      pricingVariant,
      title: "카카오 알림톡까지 바로 준비돼요",
      description: "방금 확인한 알림 조건에 맞는 새 정책을 놓치지 않도록, 프로 플랜의 빠른 알림 기능을 결제 전 한 번 더 확인해드려요.",
      benefits: [
        "카카오 알림톡으로 자격 매칭 정책을 더 빠르게 확인",
        "AI 정책 상담 무제한으로 신청 조건을 바로 점검",
        "AI 신청서 초안 자동 작성으로 접수 준비 시간 단축",
        "7일 무료체험 중 언제든 해지 가능",
      ],
    };
  }

  if (tier === "basic" && pricingVariant === "business_basic_auto_judgment") {
    return {
      source,
      recommendedTier,
      pricingVariant,
      title: "사장님 조건에 맞는 정책부터 챙겨드려요",
      description: "사업자 정보를 기준으로 자격을 진단하고, 마감 임박 정책을 이메일로 받아보는 기본 운영 흐름을 시작합니다.",
      benefits: [
        "내 가게 자격 자동 진단으로 지원 가능성 빠르게 확인",
        "마감 7일 전 이메일 알림으로 신청 기회 누락 방지",
        "맞춤 추천과 관심 정책을 무제한으로 관리",
        "7일 무료체험 중 언제든 해지 가능",
      ],
    };
  }

  if (tier === "pro") {
    return {
      source,
      recommendedTier,
      pricingVariant,
      title: "프로 기능을 7일 동안 먼저 써보세요",
      description: "카카오 알림톡, AI 상담 무제한, 신청서 초안 작성까지 한 번에 확인할 수 있어요.",
      benefits: [
        "베이직 기능 전부 포함",
        "카카오 알림톡으로 자격 매칭 정책 확인",
        "AI 정책 상담 무제한 + 신청서 초안 작성",
        "카드 등록 후 7일 무료체험, 언제든 해지 가능",
      ],
    };
  }

  return {
    source,
    recommendedTier,
    pricingVariant,
    title: "베이직 기능을 7일 동안 먼저 써보세요",
    description: "사장님 자격 진단과 마감 이메일 알림으로 놓치기 쉬운 정책을 꾸준히 챙길 수 있어요.",
    benefits: [
      "내 가게 자격 자동 진단",
      "마감 7일 전 이메일 알림",
      "맞춤 추천과 관심 정책 무제한 관리",
      "카드 등록 후 7일 무료체험, 언제든 해지 가능",
    ],
  };
}
