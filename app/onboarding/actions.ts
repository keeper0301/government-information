'use server';
// 온보딩 server action
// - user_profiles upsert + dismissed_onboarding_at 도장
// - syncAutoAlertRule 로 자동 알림 규칙 동기화
// - 2026-05-19 spec F — 마케팅 동의 시 consent_log 에 기록 (DDL 0)
import { createClient } from '@/lib/supabase/server';
import { syncAutoAlertRule } from '@/lib/personalization/auto-rule';
import { interestsToBenefitTags } from '@/lib/personalization/interest-mapping';
import { recordConsent, PRIVACY_POLICY_VERSION } from '@/lib/consent';
import type { OnboardingState } from './onboarding-flow';

export async function saveOnboardingProfile(userId: string, state: OnboardingState) {
  const supabase = await createClient();

  // 인증 재확인 (server action 보안 — 클라이언트에서 전달된 userId 를 신뢰하지 않음)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // 2026-05-19 spec E (server fail-safe) — 만 14세 사전 확인 강제.
  // 클라이언트 disabled (onboarding-flow.tsx 의 "다음/건너뛰기" disabled) 의 우회 차단.
  // 「개인정보 보호법」 제22조의2 의 진짜 보루는 server 단. devtools 우회 시도자도 막음.
  if (!state.ageConfirmed) throw new Error('만 14세 이상 확인이 필요합니다');

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

  // 2026-05-19 spec F — 마케팅 동의 (선택). 사용자가 체크박스 활성화한 경우만 기록.
  // 실패해도 onboarding 자체는 정상 종료 (graceful — try/catch 로 fold).
  if (state.marketingConsent) {
    try {
      await recordConsent({
        userId,
        consentType: 'marketing',
        version: PRIVACY_POLICY_VERSION,
      });
    } catch (err) {
      console.error('[onboarding/actions] 마케팅 동의 기록 실패:', err);
    }
  }

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
      merit: null, // 온보딩 단계 추가 안 함 — 마이페이지에서만 입력
    },
  });
}
