import type { PricingSource } from "@/lib/pricing/conversion-copy";

export type PaidCtaSource = Exclude<PricingSource, null>;

export function buildBasicPricingHref(source: PaidCtaSource): string {
  return `/pricing?from=${encodeURIComponent(source)}&recommended=basic`;
}

export function buildProPricingHref(source: PaidCtaSource): string {
  return `/pricing?from=${encodeURIComponent(source)}&recommended=pro`;
}
