'use server';
// 마이페이지 server actions
// - syncProfileAutoRule: 프로필 저장 후 자동 알림 규칙 보장
//   (form 은 client-side upsert 라 별도 server action 으로 분리)

import { createClient } from '@/lib/supabase/server';
import { syncAutoAlertRule } from '@/lib/personalization/auto-rule';
import type { UserSignals } from '@/lib/personalization/types';
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from '@/lib/profile-options';

// 프로필 저장 완료 후 호출 — 자동 알림 규칙을 최신 프로필에 맞게 갱신
// userId: 저장한 사용자 ID (client 에서 넘어옴)
export async function syncProfileAutoRule(userId: string): Promise<void> {
  const supabase = await createClient();

  // 인증 재확인 (server action 보안 — client 가 보낸 userId 와 실제 로그인 유저 일치 확인)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return;

  // 프로필 + 구독 tier 동시 조회 (속도 최적화)
  const [profileRes, subRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('age_group, region, district, occupation, income_level, household_types, benefit_tags')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  // 프로필이 없으면 규칙 생성 불필요
  if (!profile) return;

  // 구독 정보 없으면 free 로 간주
  const tier = (subRes.data?.tier ?? 'free') as 'free' | 'basic' | 'pro';

  // DB 값 → UserSignals 타입으로 변환 (추천 엔진 공용 타입)
  const signals: UserSignals = {
    ageGroup: (profile.age_group ?? null) as AgeOption | null,
    region: (profile.region ?? null) as RegionOption | null,
    district: profile.district ?? null,
    occupation: (profile.occupation ?? null) as OccupationOption | null,
    incomeLevel: (profile.income_level ?? null) as UserSignals['incomeLevel'],
    householdTypes: (profile.household_types ?? []) as string[],
    benefitTags: (profile.benefit_tags ?? []) as UserSignals['benefitTags'],
  };

  // 자동 알림 규칙 동기화 (기존 규칙 갱신 or 신규 생성)
  await syncAutoAlertRule({ userId, signals, tier });
}
