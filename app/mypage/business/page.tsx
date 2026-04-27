// app/mypage/business/page.tsx — server component
// 자영업자 "내 가게 정보" 입력 페이지 (Basic 자격 진단 wedge 의 진입점).
//
// 1회 입력 후 모든 정책 자격 ✓/✗ 자동 판정 + 카톡 알림에 자격 한 줄 첨부.
// 정보 수정은 자유 (예: 매출 변동·직원 변경 시 갱신).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { BusinessProfileForm, type BusinessFormState } from './business-form';
import type {
  BusinessIndustry,
  BusinessRevenue,
  BusinessEmployee,
  BusinessType,
} from '@/lib/profile-options';

export const metadata: Metadata = {
  title: '내 가게 정보 — keepioo',
  robots: { index: false, follow: false }, // 개인정보 페이지
};

// /mypage 와 동일하게 dynamic rendering — auth state 의존
export const dynamic = 'force-dynamic';

export default async function BusinessProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/mypage/business');

  const { data: profile } = await supabase
    .from('business_profiles')
    .select(
      'industry, revenue_scale, employee_count, business_type, established_date, region, district',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  const initial: BusinessFormState = {
    industry: (profile?.industry ?? null) as BusinessIndustry | null,
    revenue_scale: (profile?.revenue_scale ?? null) as BusinessRevenue | null,
    employee_count: (profile?.employee_count ?? null) as BusinessEmployee | null,
    business_type: (profile?.business_type ?? null) as BusinessType | null,
    established_date: profile?.established_date ?? null,
    region: profile?.region ?? null,
    district: profile?.district ?? null,
  };

  return (
    <main className="pt-28 pb-20 max-w-[640px] mx-auto px-10 max-md:pt-24 max-md:px-6">
      {/* 뒤로가기 — /mypage 로 복귀. Link 사용으로 새로고침·직접 진입에도 안전.
          모바일 터치 영역 44px 확보 (-mx-2 px-2 padding 으로 시각 정렬 유지). */}
      <Link
        href="/mypage"
        className="inline-flex items-center gap-1 text-[13px] text-grey-600 hover:text-grey-900 mb-5 -mx-2 px-2 py-2 rounded-md hover:bg-grey-50 transition-colors no-underline"
      >
        <span aria-hidden="true" className="text-[15px]">←</span>
        <span>마이페이지</span>
      </Link>

      <p className="text-[13px] font-semibold text-blue-500 mb-3 tracking-wide">
        Basic · 자영업자 자격 진단
      </p>
      <h1 className="text-[28px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[24px]">
        내 가게 정보
      </h1>
      <p className="text-[14px] text-grey-700 leading-[1.65] mb-8 max-w-[520px]">
        한 번 입력하면 모든 정책에 대해{' '}
        <strong className="font-semibold text-grey-900">사장님 자격 ✓/✗</strong> 가
        자동으로 판정돼요. 카톡 알림에도 자격 한 줄이 함께 표시되니 5초 안에
        신청 가능 여부를 알 수 있어요.
      </p>

      <BusinessProfileForm userId={user.id} initial={initial} />

      <p className="text-[12px] text-grey-600 mt-8 leading-[1.65]">
        ※ 입력하신 정보는 정책 자격 판정에만 사용되며 외부에 제공되지 않습니다.
        수정·삭제는 언제든 가능해요.
      </p>
    </main>
  );
}
