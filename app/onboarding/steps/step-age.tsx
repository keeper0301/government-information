'use client';
// 온보딩 1단계: 나이대 선택
// AGE_OPTIONS 를 profile-options.ts 에서 import → 마이페이지와 동일한 선택지 유지
import { AGE_OPTIONS, type AgeOption } from '@/lib/profile-options';

export function StepAge({
  value, onChange,
}: { value: AgeOption | null; onChange: (v: AgeOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">나이대를 골라주세요</h2>
      <p className="text-sm text-zinc-600">맞춤 정책을 보여드릴게요.</p>
      <div className="flex flex-wrap gap-2">
        {AGE_OPTIONS.map((age) => (
          <button
            key={age}
            onClick={() => onChange(value === age ? null : age)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              value === age
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
            }`}
          >
            {age}
          </button>
        ))}
      </div>
    </div>
  );
}
