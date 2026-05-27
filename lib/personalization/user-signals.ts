// ============================================================
// user signals + business profile loader (cache 포함 factory)
// ============================================================
// alert-dispatch + match-payload (Spec 3) 둘 다 cohort gate 위해 동일 데이터 필요.
// dead-code 두 경로 anti-pattern 회피 위해 lib 으로 extract.
//
// factory 패턴: 한 cron 사이클 = 1 loader 인스턴스 = closure cache.
// 같은 user 가 rule 여러 개 들고 있어도 user_profile / business_profile 1회 fetch.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserSignals } from "@/lib/personalization/types";
import type {
  AgeOption,
  BusinessIndustry,
  BusinessRevenue,
  BusinessEmployee,
  BusinessType,
  OccupationOption,
  RegionOption,
} from "@/lib/profile-options";
import type { BenefitTag } from "@/lib/tags/taxonomy";
import type { BusinessProfile } from "@/lib/eligibility/business-match";

export type { BusinessProfile };

export type UserSignalsLoader = {
  getBusinessProfile: (userId: string) => Promise<BusinessProfile | null>;
  getUserSignals: (
    userId: string,
    businessProfile: BusinessProfile | null,
  ) => Promise<UserSignals>;
};

// supabase client (admin 또는 anon) 받아서 closure cache 가진 loader 반환.
export function createUserSignalsLoader(supabase: SupabaseClient): UserSignalsLoader {
  const businessProfileCache = new Map<string, BusinessProfile | null>();
  const userSignalsCache = new Map<string, UserSignals>();

  async function getBusinessProfile(
    userId: string,
  ): Promise<BusinessProfile | null> {
    if (businessProfileCache.has(userId)) return businessProfileCache.get(userId)!;
    const { data } = await supabase
      .from("business_profiles")
      .select(
        "industry, revenue_scale, employee_count, business_type, established_date, region, district",
      )
      .eq("user_id", userId)
      .maybeSingle();
    const profile: BusinessProfile | null = data
      ? {
          industry: (data.industry ?? null) as BusinessIndustry | null,
          revenue_scale: (data.revenue_scale ?? null) as BusinessRevenue | null,
          employee_count: (data.employee_count ?? null) as BusinessEmployee | null,
          business_type: (data.business_type ?? null) as BusinessType | null,
          established_date: data.established_date ?? null,
          region: data.region ?? null,
          district: data.district ?? null,
        }
      : null;
    businessProfileCache.set(userId, profile);
    return profile;
  }

  async function getUserSignals(
    userId: string,
    businessProfile: BusinessProfile | null,
  ): Promise<UserSignals> {
    const cached = userSignalsCache.get(userId);
    if (cached) return cached;
    const { data: profile } = await supabase
      .from("user_profiles")
      .select(
        "age_group, region, district, occupation, income_level, household_types, benefit_tags, has_children, merit_status",
      )
      .eq("id", userId)
      .maybeSingle();
    const signals: UserSignals = {
      ageGroup: (profile?.age_group ?? null) as AgeOption | null,
      region: (profile?.region ?? null) as RegionOption | null,
      district: profile?.district ?? null,
      occupation: (profile?.occupation ?? null) as OccupationOption | null,
      incomeLevel: (profile?.income_level ?? null) as UserSignals["incomeLevel"],
      householdTypes: (profile?.household_types ?? []) as string[],
      benefitTags: (profile?.benefit_tags ?? []) as BenefitTag[],
      hasChildren: (profile?.has_children ?? null) as boolean | null,
      merit: (profile?.merit_status ?? null) as "merit" | "none" | null,
      businessProfile,
    };
    userSignalsCache.set(userId, signals);
    return signals;
  }

  return { getBusinessProfile, getUserSignals };
}
