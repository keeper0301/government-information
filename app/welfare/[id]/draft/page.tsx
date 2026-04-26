// app/welfare/[id]/draft/page.tsx
// Pro 사용자 전용 — welfare 정책 신청서 초안.
// requireTier('pro') 가드 → 미Pro 는 /pricing?gate=pro 로 redirect.

import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireTier } from '@/lib/subscription';
import { generateApplicationDraft, type UserDraftProfile } from '@/lib/application-draft';
import { ApplicationDraftView } from '@/components/application-draft-view';
import type { BusinessProfile } from '@/lib/eligibility/business-match';
import type {
  BusinessIndustry,
  BusinessRevenue,
  BusinessEmployee,
  BusinessType,
} from '@/lib/profile-options';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pro 신청서 초안 — keepioo',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

export default async function WelfareDraftPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/welfare/${id}/draft`);

  // Pro 가드 — 미달 시 pricing 페이지로 (gate=pro&from=draft 로 분석 가능)
  const tier = await requireTier(user.id, 'pro');
  if (!tier) redirect(`/pricing?gate=pro&from=draft`);

  // 정책 + 사용자 프로필 + 사업장 정보 병렬 fetch
  const [
    { data: program },
    { data: profile },
    { data: business },
  ] = await Promise.all([
    supabase
      .from('welfare_programs')
      .select(
        'id, title, description, eligibility, apply_method, apply_url, category, source, benefit_tags',
      )
      .eq('id', id)
      .single(),
    supabase
      .from('user_profiles')
      .select('age_group, region, district, occupation, income_level, household_types')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('business_profiles')
      .select(
        'industry, revenue_scale, employee_count, business_type, established_date, region, district',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (!program) notFound();

  const businessProfile: BusinessProfile | null = business
    ? {
        industry: (business.industry ?? null) as BusinessIndustry | null,
        revenue_scale: (business.revenue_scale ?? null) as BusinessRevenue | null,
        employee_count: (business.employee_count ?? null) as BusinessEmployee | null,
        business_type: (business.business_type ?? null) as BusinessType | null,
        established_date: business.established_date ?? null,
        region: business.region ?? null,
        district: business.district ?? null,
      }
    : null;

  const userProfile: UserDraftProfile = {
    email: user.email ?? null,
    age_group: profile?.age_group ?? null,
    region: profile?.region ?? null,
    district: profile?.district ?? null,
    occupation: profile?.occupation ?? null,
    income_level: profile?.income_level ?? null,
    household_types: profile?.household_types ?? [],
    business: businessProfile,
  };

  const draft = generateApplicationDraft(program, userProfile);

  return <ApplicationDraftView draft={draft} programType="welfare" programId={id} />;
}
