import type { Tier } from "@/lib/subscription";

export type PricingSearchParams = {
  recommended?: string | string[];
};

export type RecommendedTier = Extract<Tier, "basic" | "pro"> | null;

export function parseRecommendedTier(
  searchParams: PricingSearchParams | null | undefined,
): RecommendedTier {
  const raw = Array.isArray(searchParams?.recommended)
    ? searchParams?.recommended[0]
    : searchParams?.recommended;

  if (raw === "basic" || raw === "pro") return raw;
  return null;
}
