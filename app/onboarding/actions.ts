'use server';
// 온보딩 server action
// - user_profiles upsert + dismissed_onboarding_at 도장
// - syncAutoAlertRule 로 자동 알림 규칙 동기화
import { createClient } from '@/lib/supabase/server';
import { syncAutoAlertRule } from '@/lib/personalization/auto-rule';
import { interestsToBenefitTags } from '@/lib/personalization/interest-mapping';
import type { OnboardingState } from './onboarding-flow';

export async function saveOnboardingProfile(userId: string, state: OnboardingState) {
  const supabase = await createClient();

  // 인증 재확인 (server action 보안 — 클라이언트에서 전달된 userId 를 신뢰하지 않음)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // user_profiles upsert (PK: id = auth.users.id)
  // dismissed_onboarding_at 을 현재 시각으로 채워 첫 온보딩 완료를 기록
  await supabase.from('user_profiles').upsert({
    id: userId,
    age_group: state.ageGroup,
    region: state.region,
    district: state.district,
    occupation: state.occupation,
    interests: state.interests,
    income_level: state.incomeLevel,
    household_types: state.householdTypes,
    dismissed_onboarding_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // 현재 구독 tier 조회 (없으면 'free' 기본값)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();

  // 프로필 신호 기반 자동 알림 규칙 동기화
  await syncAutoAlertRule({
    userId,
    tier: (sub?.tier ?? 'free') as 'free' | 'basic' | 'pro',
    signals: {
      ageGroup: state.ageGroup,
      region: state.region,
      district: state.district,
      occupation: state.occupation,
      incomeLevel: state.incomeLevel,
      householdTypes: state.householdTypes,
      benefitTags: interestsToBenefitTags(state.interests),
      hasChildren: state.hasChildren ?? null,
    },
  });
}
