'use client';
// app/mypage/business/business-form.tsx
// 자영업자 "내 가게 정보" 입력 폼 (client component).
//
// 기존 ProfileForm 과 같은 패턴: client-side supabase upsert + RLS 본인 가드.
// 모든 필드 선택적 — 일부만 입력해도 OK (matchBusinessProfile 가 보수적으로 unknown 처리).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BUSINESS_INDUSTRY_OPTIONS,
  BUSINESS_REVENUE_OPTIONS,
  BUSINESS_EMPLOYEE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  REGION_OPTIONS,
  getDistrictsForRegion,
  type BusinessIndustry,
  type BusinessRevenue,
  type BusinessEmployee,
  type BusinessType,
} from '@/lib/profile-options';

export type BusinessFormState = {
  industry: BusinessIndustry | null;
  revenue_scale: BusinessRevenue | null;
  employee_count: BusinessEmployee | null;
  business_type: BusinessType | null;
  established_date: string | null;
  region: string | null;
  district: string | null;
};

// /mypage 와 동일하게 "전국" 제외
const REGIONS = REGION_OPTIONS.filter((r) => r !== '전국');

export function BusinessProfileForm({
  userId,
  initial,
}: {
  userId: string;
  initial: BusinessFormState;
}) {
  const router = useRouter();
  const [form, setForm] = useState<BusinessFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 저장 성공 배지 1.8초 후 자동 해제 (ProfileForm 패턴 동일)
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  function update<K extends keyof BusinessFormState>(
    key: K,
    value: BusinessFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  // 광역 변경 시 시군구 자동 초기화 (잘못된 시군구 페어 방지)
  function changeRegion(region: string | null) {
    setForm((prev) => ({ ...prev, region, district: null }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      setError('로그인이 만료되었어요. 다시 로그인해주세요.');
      setSaving(false);
      return;
    }
    const { error: upsertError } = await supabase
      .from('business_profiles')
      .upsert({
        user_id: user.id,
        industry: form.industry,
        revenue_scale: form.revenue_scale,
        employee_count: form.employee_count,
        business_type: form.business_type,
        established_date: form.established_date,
        region: form.region,
        district: form.district,
      });
    if (upsertError) {
      setError('저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    } else {
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  }

  const districts = form.region ? getDistrictsForRegion(form.region) : [];

  return (
    <div className="space-y-6 bg-white rounded-2xl shadow-sm p-6 max-md:p-5">
      {/* 업종 */}
      <FormSelect
        label="업종"
        value={form.industry ?? ''}
        onChange={(v) => update('industry', (v || null) as BusinessIndustry | null)}
        options={BUSINESS_INDUSTRY_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
      />

      {/* 매출 규모 */}
      <FormSelect
        label="작년 매출 규모"
        value={form.revenue_scale ?? ''}
        onChange={(v) =>
          update('revenue_scale', (v || null) as BusinessRevenue | null)
        }
        options={BUSINESS_REVENUE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        hint="추정값 OK. 정확한 금액은 보지 않아요."
      />

      {/* 직원수 */}
      <FormSelect
        label="상시근로자 수 (사장님 본인 제외)"
        value={form.employee_count ?? ''}
        onChange={(v) =>
          update('employee_count', (v || null) as BusinessEmployee | null)
        }
        options={BUSINESS_EMPLOYEE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        hint="소상공인 자격 판정에 가장 중요한 정보예요."
      />

      {/* 사업자 유형 */}
      <div>
        <label className="block text-[14px] font-semibold text-grey-700 mb-2">
          사업자 유형
        </label>
        <div className="flex gap-2 max-md:flex-col">
          {BUSINESS_TYPE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-4 py-2.5 bg-grey-50 hover:bg-grey-100 rounded-xl cursor-pointer min-h-[44px] flex-1"
            >
              <input
                type="radio"
                name="business_type"
                value={o.value}
                checked={form.business_type === o.value}
                onChange={() => update('business_type', o.value)}
                className="w-4 h-4"
              />
              <span className="text-[14px] text-grey-900">{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 사업자등록일 */}
      <div>
        <label
          htmlFor="established-date"
          className="block text-[14px] font-semibold text-grey-700 mb-2"
        >
          사업자등록일
        </label>
        <input
          id="established-date"
          type="date"
          value={form.established_date ?? ''}
          onChange={(e) => update('established_date', e.target.value || null)}
          className="w-full min-h-[48px] px-4 text-[15px] rounded-xl border border-grey-200 bg-white text-grey-900 focus:border-blue-500 focus:outline-none"
        />
        <p className="text-[12px] text-grey-600 mt-1.5">
          창업 N년차 자격 매칭에 사용 (예: 창업 3년 이내 정책)
        </p>
      </div>

      {/* 사업장 지역 */}
      <FormSelect
        label="사업장 광역 지역"
        value={form.region ?? ''}
        onChange={(v) => changeRegion(v || null)}
        options={REGIONS.map((r) => ({ value: r, label: r }))}
      />

      {districts.length > 0 && (
        <FormSelect
          label="시·군·구"
          value={form.district ?? ''}
          onChange={(v) => update('district', v || null)}
          options={[
            { value: '', label: '선택 안 함' },
            ...districts.map((d) => ({ value: d, label: d })),
          ]}
        />
      )}

      {/* 저장 + 상태 */}
      <div className="pt-4 border-t border-grey-100 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[48px] px-6 text-[15px] font-bold rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:bg-grey-300 disabled:cursor-not-allowed border-0 cursor-pointer transition-colors"
        >
          {saving ? '저장 중…' : saved ? '✓ 저장됐어요' : '저장하기'}
        </button>
        {error && (
          <span className="text-[13px] text-red leading-[1.5]">{error}</span>
        )}
      </div>
    </div>
  );
}

// 공용 select 컴포넌트 (페이지 안에서 일관성 + 라인 절감)
function FormSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-grey-700 mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[48px] px-4 text-[15px] rounded-xl border border-grey-200 bg-white text-grey-900 focus:border-blue-500 focus:outline-none"
      >
        <option value="">선택 안 함</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-[12px] text-grey-600 mt-1.5">{hint}</p>}
    </div>
  );
}
