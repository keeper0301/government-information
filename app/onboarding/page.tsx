// app/onboarding/page.tsx — 서버 컴포넌트
// 가입 직후 또는 사용자가 직접 진입하는 5단계 온보딩 페이지
// - 미인증이면 /login?next=/onboarding 으로 redirect
// - 이미 프로필이 채워져 있어도 다시 입력 가능 (수정 용도)
// - dismissed_onboarding_at 이 NULL 이면 첫 진입
// - /quiz 가입 funnel 쿠키가 있으면 빈 필드만 자동 채움 (server SSR 일치)
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow, type OnboardingState } from './onboarding-flow';
import type {
  IncomeOption, HouseholdOption,
} from '@/lib/profile-options';
import { readQuizPrefillFromCookie } from '@/lib/quiz-prefill-server';

export const metadata = { title: '온보딩 — keepioo' };

export default async function OnboardingPage() {
  const supabase = await createClient();

  // 인증 확인 — 비로그인 시 로그인 페이지로
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');

  // 기존 프로필 로드 (없으면 maybeSingle → null)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('age_group, region, district, occupation, interests, income_level, household_types')
    .eq('id', user.id)
    .maybeSingle();

  // 기본 initial — DB 프로필 그대로
  const baseInitial: OnboardingState = {
    ageGroup: profile?.age_group ?? null,
    region: profile?.region ?? null,
    district: profile?.district ?? null,
    occupation: profile?.occupation ?? null,
    interests: profile?.interests ?? [],
    incomeLevel: (profile?.income_level ?? null) as IncomeOption | null,
    householdTypes: (profile?.household_types ?? []) as HouseholdOption[],
  };

  // /quiz 가입 funnel 쿠키 — 빈 필드만 채움 (DB 값이 있으면 보존)
  const prefill = await readQuizPrefillFromCookie();
  let prefillApplied = false;
  const initial: OnboardingState = { ...baseInitial };
  if (prefill) {
    if (!initial.ageGroup && prefill.ageGroup) {
      initial.ageGroup = prefill.ageGroup;
      prefillApplied = true;
    }
    if (!initial.region && prefill.region) {
      initial.region = prefill.region;
      prefillApplied = true;
    }
    if (!initial.occupation && prefill.occupation) {
      initial.occupation = prefill.occupation;
      prefillApplied = true;
    }
    if (!initial.incomeLevel && prefill.incomeLevel) {
      initial.incomeLevel = prefill.incomeLevel;
      prefillApplied = true;
    }
    if (initial.householdTypes.length === 0 && prefill.householdTypes.length > 0) {
      initial.householdTypes = prefill.householdTypes;
      prefillApplied = true;
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <OnboardingFlow
          userId={user.id}
          initial={initial}
          prefillApplied={prefillApplied}
        />
      </div>
    </main>
  );
}
