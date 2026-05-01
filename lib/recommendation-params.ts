import type { ProgramType } from "@/lib/recommend";
import type { UserSignals } from "@/lib/personalization/types";
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from "@/lib/profile-options";

export type RecommendationParamsFromProfile = {
  ageGroup: AgeOption;
  region: RegionOption;
  district: string | null;
  occupation: OccupationOption;
  incomeLevel: UserSignals["incomeLevel"];
  householdTypes: string[];
  benefitTags: UserSignals["benefitTags"];
  hasChildren: boolean | null;
  merit: UserSignals["merit"];
  businessProfile: UserSignals["businessProfile"];
  programType: ProgramType;
};

export function buildRecommendationParamsFromSignals(
  signals: UserSignals | null | undefined,
  options: { programType?: ProgramType } = {},
): RecommendationParamsFromProfile | null {
  if (!signals?.ageGroup || !signals.region || !signals.occupation) {
    return null;
  }

  return {
    ageGroup: signals.ageGroup,
    region: signals.region,
    district: signals.district ?? null,
    occupation: signals.occupation,
    incomeLevel: signals.incomeLevel ?? null,
    householdTypes: signals.householdTypes ?? [],
    benefitTags: signals.benefitTags ?? [],
    hasChildren: signals.hasChildren ?? null,
    merit: signals.merit ?? null,
    businessProfile: signals.businessProfile ?? null,
    programType: options.programType ?? "all",
  };
}
