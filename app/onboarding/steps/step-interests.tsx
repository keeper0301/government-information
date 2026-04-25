'use client';
// 온보딩 5단계: 관심 분야 + 가구 상태 선택
// - INTEREST_LABELS: 마이페이지(app/mypage/profile-form.tsx) 와 동일한 9개
// - HOUSEHOLD_OPTIONS: profile-options.ts 단일 소스 import
import { HOUSEHOLD_OPTIONS, type HouseholdOption } from '@/lib/profile-options';

// 마이페이지 관심사와 완전히 동일한 9개 라벨 (interest-mapping.ts 가 이 라벨로 매핑)
const INTEREST_LABELS = [
  '복지', '대출', '청년', '출산·육아', '창업',
  '주거', '교육', '의료', '고용',
] as const;

export function StepInterests({
  interests, householdTypes, onChange,
}: {
  interests: string[];
  householdTypes: HouseholdOption[];
  onChange: (i: string[], h: HouseholdOption[]) => void;
}) {
  // 관심 분야 토글 (다중 선택)
  function toggleInterest(label: string) {
    const next = interests.includes(label)
      ? interests.filter((i) => i !== label)
      : [...interests, label];
    onChange(next, householdTypes);
  }

  // 가구 상태 토글 (다중 선택)
  function toggleHousehold(value: HouseholdOption) {
    const next = householdTypes.includes(value)
      ? householdTypes.filter((h) => h !== value)
      : [...householdTypes, value];
    onChange(interests, next);
  }

  return (
    <div className="space-y-6">
      {/* 관심 분야 다중 선택 */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold">관심 있는 분야 (다중 선택)</h2>
        <div className="flex flex-wrap gap-2">
          {INTEREST_LABELS.map((label) => {
            const checked = interests.includes(label);
            return (
              <button
                key={label}
                onClick={() => toggleInterest(label)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  checked
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 가구 상태 다중 선택 (민감정보 안내 포함) */}
      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-base font-semibold">가구 상태 (선택)</h2>
        <p className="text-xs text-zinc-500">
          민감정보로 분류되며 맞춤 추천에만 사용됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {HOUSEHOLD_OPTIONS.map((opt) => {
            const checked = householdTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleHousehold(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  checked
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
