'use client';
// 온보딩 2단계: 거주 지역 선택
// - 광역 시·도 선택 (REGION_OPTIONS)
// - 광역 선택 후 시·군·구 dropdown 노출 (getDistrictsForRegion)
import {
  REGION_OPTIONS, getDistrictsForRegion,
  type RegionOption,
} from '@/lib/profile-options';

export function StepRegion({
  region, district, onChange,
}: {
  region: RegionOption | null;
  district: string | null;
  onChange: (r: RegionOption | null, d: string | null) => void;
}) {
  // 광역 선택 시 해당 광역의 시군구 목록 계산 (없으면 빈 배열)
  const districts = region ? getDistrictsForRegion(region) : [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">거주 지역은요?</h2>

      {/* 광역 시·도 선택 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">시·도</label>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onChange(region === r ? null : (r as RegionOption), null)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                region === r
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* 시·군·구 선택 (광역 선택 후에만 노출) */}
      {districts.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">시·군·구 (선택)</label>
          <select
            value={district ?? ''}
            onChange={(e) => onChange(region, e.target.value || null)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">선택 안 함</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
