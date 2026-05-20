import type { UserSignals } from "@/lib/personalization/types";

type ProfileCompletionField = {
  key: string;
  label: string;
  completed: boolean;
};

export type ProfileCompletionSummary = {
  completed: number;
  total: number;
  percent: number;
  missingLabels: string[];
};

export function getProfileCompletionSummary(
  signals: UserSignals,
): ProfileCompletionSummary {
  const fields: ProfileCompletionField[] = [
    { key: "age", label: "나이", completed: Boolean(signals.ageGroup) },
    { key: "region", label: "지역", completed: Boolean(signals.region) },
    { key: "occupation", label: "직업", completed: Boolean(signals.occupation) },
    { key: "income", label: "소득", completed: Boolean(signals.incomeLevel) },
    {
      key: "household",
      label: "가구",
      completed: signals.householdTypes.length > 0 || signals.hasChildren !== null,
    },
    { key: "interests", label: "관심분야", completed: signals.benefitTags.length > 0 },
  ];
  const completed = fields.filter((field) => field.completed).length;

  return {
    completed,
    total: fields.length,
    percent: Math.round((completed / fields.length) * 100),
    missingLabels: fields
      .filter((field) => !field.completed)
      .map((field) => field.label),
  };
}
