'use client';
// 온보딩 3단계: 직업·상황 선택
// OCCUPATION_OPTIONS 를 profile-options.ts 에서 import → 마이페이지와 동일한 선택지 유지
import { OCCUPATION_OPTIONS, type OccupationOption } from '@/lib/profile-options';

export function StepOccupation({
  value, onChange,
}: { value: OccupationOption | null; onChange: (v: OccupationOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">현재 직업·상황은요?</h2>
      <div className="flex flex-wrap gap-2">
        {OCCUPATION_OPTIONS.map((occ) => (
          <button
            key={occ}
            onClick={() => onChange(value === occ ? null : occ)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              value === occ
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
            }`}
          >
            {occ}
          </button>
        ))}
      </div>
    </div>
  );
}
