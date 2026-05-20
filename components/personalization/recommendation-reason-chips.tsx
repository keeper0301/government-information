import {
  getMatchReasonLabels,
  type MatchReasonLabelOptions,
} from "@/lib/personalization/reason-labels";
import type { MatchSignal } from "@/lib/personalization/types";

export type RecommendationReasonChipsProps = {
  signals: MatchSignal[];
  limit?: number;
  labelOptions?: Omit<MatchReasonLabelOptions, "limit">;
  className?: string;
  chipClassName?: string;
};

export function RecommendationReasonChips({
  signals,
  limit = 5,
  labelOptions,
  className = "flex flex-wrap items-center gap-1.5",
  chipClassName = "inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700",
}: RecommendationReasonChipsProps) {
  const reasons = getMatchReasonLabels(signals, {
    ...labelOptions,
    limit,
  });

  if (reasons.length === 0) return null;

  return (
    <div className={className}>
      {reasons.map((reason) => (
        <span key={reason} className={chipClassName}>
          {reason}
        </span>
      ))}
    </div>
  );
}
