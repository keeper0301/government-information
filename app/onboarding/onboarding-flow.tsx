'use client';
// 온보딩 flow 컴포넌트 (클라이언트)
// - 5단계 진행 표시줄 + 이전/건너뛰기/다음 버튼 관리
// - 각 단계별 step 컴포넌트를 렌더링
// - 마지막 단계에서 완료 → saveOnboardingProfile server action 호출 후 /mypage 이동
import { useState } from 'react';
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

// 온보딩 상태 타입 (5단계에서 공유)
export type OnboardingState = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  district: string | null;
  occupation: OccupationOption | null;
  incomeLevel: IncomeOption | null;
  householdTypes: HouseholdOption[];
  interests: string[];
};

// 총 단계 수
const TOTAL_STEPS = 5;

export function OnboardingFlow({
  userId, initial,
}: {
  userId: string;
  initial: OnboardingState;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>(initial);
  const [saving, setSaving] = useState(false);

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

      {/* 단계별 step 컴포넌트 */}
      {step === 1 && (
        <StepAge value={state.ageGroup} onChange={(v) => update('ageGroup', v)} />
      )}
      {step === 2 && (
        <StepRegion
          region={state.region}
          district={state.district}
          onChange={(r, d) => { update('region', r); update('district', d); }}
        />
      )}
      {step === 3 && (
        <StepOccupation value={state.occupation} onChange={(v) => update('occupation', v)} />
      )}
      {step === 4 && (
        <StepIncome value={state.incomeLevel} onChange={(v) => update('incomeLevel', v)} />
      )}
      {step === 5 && (
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
