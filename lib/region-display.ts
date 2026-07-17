export const INTEGRATED_REGION_LABEL = "전남광주통합특별시";

const INTEGRATED_REGION_ALIASES = [
  "전남광주통합특별시",
  "광주·전남",
  "광주전남",
];

export function formatRegionDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (INTEGRATED_REGION_ALIASES.includes(value)) return INTEGRATED_REGION_LABEL;
  return value;
}

export function formatProvinceDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  if (value === "광주" || value === "전남") return INTEGRATED_REGION_LABEL;
  return formatRegionDisplay(value) ?? value;
}
