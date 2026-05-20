import type { MatchSignal } from "@/lib/personalization/types";

export type MatchReasonLabelMap = Record<MatchSignal["kind"], string>;

export const DEFAULT_MATCH_REASON_LABELS: MatchReasonLabelMap = {
  region: "지역",
  district: "시군구",
  sub_district: "읍면동",
  benefit_tags: "관심",
  occupation: "직업",
  age: "나이",
  income_keyword: "소득",
  income_target: "소득",
  household_keyword: "가구",
  household_target: "가구",
  urgent_deadline: "마감",
  business_match: "사업자",
  popularity: "인기",
};

export type MatchReasonLabelOptions = {
  limit?: number;
  labels?: Partial<MatchReasonLabelMap>;
};

export function getMatchReasonLabels(
  signals: MatchSignal[],
  options: MatchReasonLabelOptions = {},
): string[] {
  const limit = options.limit ?? 5;
  if (limit <= 0) return [];

  const labelsByKind = {
    ...DEFAULT_MATCH_REASON_LABELS,
    ...options.labels,
  };
  const labels: string[] = [];

  for (const signal of signals) {
    const label = labelsByKind[signal.kind];
    if (!label || labels.includes(label)) continue;
    labels.push(label);
    if (labels.length >= limit) break;
  }

  return labels;
}

export function getRecommendationConfidenceLabel(signals: MatchSignal[]): string {
  const reasons = getMatchReasonLabels(signals, { limit: 10 });
  const hasQualificationSignal = signals.some((signal) =>
    signal.kind === "income_target" ||
    signal.kind === "household_target" ||
    signal.kind === "occupation" ||
    signal.kind === "business_match"
  );

  if (!hasQualificationSignal) return "확인 필요";
  if (reasons.length >= 4) return "매우 적합";
  if (reasons.length >= 2) return "적합";
  return "확인 필요";
}
