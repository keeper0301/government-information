// lib/personalization/load-profile.ts
// 로그인 사용자의 프로필을 SSR 1회 요청당 1번만 조회 (React cache)
// 페이지에서 PersonalizedSection + MatchBadge 가 동시에 호출해도 DB hit 1번
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { UserSignals } from './types';
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from '@/lib/profile-options';
import type { BenefitTag } from '@/lib/tags/taxonomy';

export type LoadedProfile = {
  userId: string;
  displayName: string;
  signals: UserSignals;
  isEmpty: boolean;
  hasProfile: boolean;
  dismissedOnboardingAt: string | null;
};

// displayName 도출 — full_name → 이메일 앞부분 → '회원' 순서로 fallback
function deriveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata;
  const fullName = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (fullName) return fullName;
  const email = user.email ?? '';
  const local = email.split('@')[0];
  if (local) return local;
  return '회원';
}

// React cache 로 SSR 1회 요청당 DB 1번만 조회
// 로그인하지 않은 경우 null 반환
export const loadUserProfile = cache(async (): Promise<LoadedProfile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const displayName = deriveDisplayName(user);

  // user_profiles.id = auth.users.id (직접 참조, user_id 아님)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`
      id, age_group, region, district, occupation,
      interests, income_level, household_types, benefit_tags,
      dismissed_onboarding_at
    `)
    .eq('id', user.id)
    .maybeSingle();

  // 프로필 행이 아직 없는 경우 — 빈 signals 반환
  if (!profile) {
    return {
      userId: user.id,
      displayName,
      signals: {
        ageGroup: null,
        region: null,
        district: null,
        occupation: null,
        incomeLevel: null,
        householdTypes: [],
        benefitTags: [],
      },
      isEmpty: true,
      hasProfile: false,
      dismissedOnboardingAt: null,
    };
  }

  // DB 값 → UserSignals 타입으로 변환
  const signals: UserSignals = {
    ageGroup: (profile.age_group ?? null) as AgeOption | null,
    region: (profile.region ?? null) as RegionOption | null,
    district: profile.district ?? null,
    occupation: (profile.occupation ?? null) as OccupationOption | null,
    incomeLevel: (profile.income_level ?? null) as UserSignals['incomeLevel'],
    householdTypes: (profile.household_types ?? []) as string[],
    benefitTags: (profile.benefit_tags ?? []) as BenefitTag[],
  };

  // 추천에 쓸 수 있는 신호가 하나도 없으면 isEmpty = true
  const isEmpty =
    !signals.ageGroup && !signals.region && !signals.occupation &&
    !signals.incomeLevel && signals.householdTypes.length === 0 &&
    signals.benefitTags.length === 0;

  return {
    userId: user.id,
    displayName,
    signals,
    isEmpty,
    hasProfile: true,
    dismissedOnboardingAt: profile.dismissed_onboarding_at ?? null,
  };
});
