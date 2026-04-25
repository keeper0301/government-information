'use client';
// 온보딩 4단계: 소득 수준 선택 (선택 사항)
// INCOME_OPTIONS 를 profile-options.ts 에서 import → 마이페이지와 동일한 옵션
import { INCOME_OPTIONS, type IncomeOption } from '@/lib/profile-options';

export function StepIncome({
  value, onChange,
}: { value: IncomeOption | null; onChange: (v: IncomeOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">소득 수준 (선택)</h2>
      <p className="text-xs text-zinc-500">
        이 정보는 맞춤 추천에만 사용되며 외부에 제공되지 않습니다.
      </p>
      <div className="flex flex-col gap-2">
        {INCOME_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-zinc-50"
          >
            <input
              type="radio"
              name="income_level"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5"
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
        {/* 라디오 전체 해제 버튼 */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-zinc-500 underline self-start mt-2"
        >
          선택 안 함
        </button>
      </div>
    </div>
  );
}
