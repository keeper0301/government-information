'use client';
// 온보딩 flow 컴포넌트 (클라이언트)
// - 5단계 진행 표시줄 + 이전/건너뛰기/다음 버튼 관리
// - 각 단계별 step 컴포넌트를 렌더링
// - 마지막 단계에서 완료 → saveOnboardingProfile server action 호출 후 /mypage 이동
// - prefill 처리: page.tsx 가 server 단에서 쿠키 읽어 initial 에 합쳐 전달.
//   여기는 mount 시 쿠키만 정리 (재진입 시 prefill 재적용 방지)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepAge } from './steps/step-age';
import { StepRegion } from './steps/step-region';
import { StepOccupation } from './steps/step-occupation';
import { StepIncome } from './steps/step-income';
import { StepInterests } from './steps/step-interests';
import type {
  AgeOption, RegionOption, OccupationOption,
  IncomeOption, HouseholdOption,
} from '@/lib/profile-options';
import { saveOnboardingProfile } from './actions';
import { clearQuizPrefill } from '@/lib/quiz-prefill';
import { trackEvent, EVENTS } from '@/lib/analytics';

// 온보딩 상태 타입 (5단계에서 공유)
export type OnboardingState = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  district: string | null;
  occupation: OccupationOption | null;
  incomeLevel: IncomeOption | null;
  householdTypes: HouseholdOption[];
  hasChildren: boolean | null; // 자녀 유무 (산후조리·아동 cohort) — 마이페이지에서 단순 라디오, 온보딩은 옵션
  interests: string[];
};

// 총 단계 수 (2026-04-28 Phase 2: 5단계 → 3단계 합치기 — 사용자 부담 ↓)
//   1: 기본 (Age + Region)
//   2: 자격 (Occupation + Income)
//   3: 관심 (Interests + Household — StepInterests 가 두 가지 모두 처리)
const TOTAL_STEPS = 3;

export function OnboardingFlow({
  userId, initial, prefillApplied,
}: {
  userId: string;
  initial: OnboardingState;
  // page.tsx 가 쿠키 prefill 을 initial 에 적용했는지 여부
  // - true: 쿠키 정리 + GA4 funnel 이벤트 발사
  // - false: 일반 진입 (재진입 등) — 부작용 없음
  prefillApplied: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>(initial);
  const [saving, setSaving] = useState(false);

  // ───────────────────────────────────────────────
  // /quiz 쿠키 후처리 — prefill 적용된 경우에만 mount 시 1회.
  // 1) 쿠키 정리: 재진입(또는 다른 사용자 로그인) 시 prefill 재사용 방지
  // 2) GA4 funnel 이벤트: 쿼즈→가입→prefill 전환율 측정
  // setState 호출 없는 effect 라 react-hooks/set-state-in-effect 룰 통과.
  // ───────────────────────────────────────────────
  useEffect(() => {
    if (!prefillApplied) return;
    clearQuizPrefill();
    trackEvent(EVENTS.QUIZ_PREFILL_APPLIED, {
      age: initial.ageGroup ?? 'none',
      region: initial.region ?? 'none',
      has_income: initial.incomeLevel ? 'yes' : 'no',
      has_household: initial.householdTypes.length > 0 ? 'yes' : 'no',
    });
  }, [prefillApplied, initial.ageGroup, initial.region, initial.incomeLevel, initial.householdTypes.length]);

  // 특정 키 값만 업데이트하는 헬퍼
  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // 마지막 단계 완료 → server action 저장 후 마이페이지로 이동
  async function finish() {
    setSaving(true);
    await saveOnboardingProfile(userId, state);
    setSaving(false);
    router.push('/mypage?onboarded=1');
    router.refresh();
  }

  // 다음 단계로 이동 (마지막이면 완료)
  function next() {
    // GA4 funnel — 단계별 진입 측정 (3단계 합치기 후 신규 이벤트)
    if (step === 1) trackEvent(EVENTS.ONBOARDING_STEP_BASIC_COMPLETED, {});
    else if (step === 2) trackEvent(EVENTS.ONBOARDING_STEP_ELIGIBILITY_COMPLETED, {});
    else if (step === 3) trackEvent(EVENTS.ONBOARDING_STEP_INTERESTS_COMPLETED, {});

    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else finish();
  }

  // 건너뛰기 = 현재 단계 값 그대로 두고 다음으로
  function skip() { next(); }

  // 이전 단계로 이동
  function back() { if (step > 1) setStep((s) => s - 1); }

  return (
    <div className="space-y-6">
      {/* 진행 표시줄 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < step ? 'bg-emerald-600' : 'bg-zinc-200'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-500">{step}/{TOTAL_STEPS}</p>
      </div>

      {/* 단계별 step 컴포넌트 — 5단계 → 3단계 묶음 (2026-04-28 Phase 2).
          한 단계 안에 2 컴포넌트가 들어가는 경우 section + 구분선으로 시각 위계 */}
      {step === 1 && (
        <div className="space-y-8">
          <section>
            <h3 className="text-[18px] font-bold text-grey-900 mb-3">연령대</h3>
            <StepAge value={state.ageGroup} onChange={(v) => update('ageGroup', v)} />
          </section>
          <hr className="border-grey-100" />
          <section>
            <h3 className="text-[18px] font-bold text-grey-900 mb-3">지역</h3>
            <StepRegion
              region={state.region}
              district={state.district}
              onChange={(r, d) => { update('region', r); update('district', d); }}
            />
          </section>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-8">
          <section>
            <h3 className="text-[18px] font-bold text-grey-900 mb-3">직업</h3>
            <StepOccupation value={state.occupation} onChange={(v) => update('occupation', v)} />
          </section>
          <hr className="border-grey-100" />
          <section>
            <h3 className="text-[18px] font-bold text-grey-900 mb-3">소득 (선택)</h3>
            <StepIncome value={state.incomeLevel} onChange={(v) => update('incomeLevel', v)} />
          </section>
        </div>
      )}
      {step === 3 && (
        <StepInterests
          interests={state.interests}
          householdTypes={state.householdTypes}
          onChange={(i, h) => { update('interests', i); update('householdTypes', h); }}
        />
      )}

      {/* 이전 / 건너뛰기 / 다음(완료) 버튼 영역 */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={back}
          disabled={step === 1 || saving}
          className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-30"
        >
          ← 이전
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={skip}
            disabled={saving}
            className="text-sm text-zinc-500 hover:text-zinc-700 px-3 py-1.5"
          >
            건너뛰기
          </button>
          <button
            onClick={next}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {step === TOTAL_STEPS ? (saving ? '저장 중…' : '완료') : '다음 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
