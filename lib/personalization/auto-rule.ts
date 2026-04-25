// lib/personalization/auto-rule.ts
// 사용자 프로필이 저장될 때 user_alert_rules 에 자동 규칙 1건 보장
// - 이미 있으면 갱신 (사용자 수동 규칙은 보존)
// - 사용자가 자동 규칙을 끄면(auto_rule_disabled_at) 다시 생성하지 않음
// - 모든 신호가 빈 값이면 생성 건너뜀 (전체 정책 매칭 → 스팸 방지)
import { createClient } from '@/lib/supabase/server';
import type { UserSignals } from './types';

type SyncOptions = {
  userId: string;
  signals: UserSignals;
  tier: 'free' | 'basic' | 'pro';
};

export async function syncAutoAlertRule(opts: SyncOptions): Promise<void> {
  const { userId, signals, tier } = opts;

  // 사용할 수 있는 신호가 하나도 없으면 전체 정책이 매칭 → 스팸 방지를 위해 건너뜀
  const hasAnySignal =
    signals.region || signals.ageGroup || signals.occupation ||
    signals.benefitTags.length > 0 || signals.householdTypes.length > 0;
  if (!hasAnySignal) return;

  const supabase = await createClient();

  // 기존에 자동 생성된 규칙이 있는지 조회
  const { data: existing } = await supabase
    .from('user_alert_rules')
    .select('id, auto_rule_disabled_at')
    .eq('user_id', userId)
    .eq('is_auto_generated', true)
    .maybeSingle();

  // 사용자가 자동 규칙을 비활성화했으면 다시 생성하지 않음
  if (existing?.auto_rule_disabled_at) return;

  // tier 에 따라 알림 채널 결정 (pro 는 이메일 + 카카오, 나머지는 이메일만)
  const channels = tier === 'pro' ? ['email', 'kakao'] : ['email'];

  const payload = {
    user_id: userId,
    name: '내 조건 맞춤 알림',
    region_tags: signals.region ? [signals.region] : [],
    age_tags: signals.ageGroup ? [signals.ageGroup] : [],
    occupation_tags: signals.occupation ? [signals.occupation] : [],
    benefit_tags: signals.benefitTags,
    household_tags: signals.householdTypes,
    channels,
    is_auto_generated: true,
    is_active: true,
  };

  if (existing) {
    // 기존 자동 규칙 갱신 — 사용자 수동 규칙(is_auto_generated=false)은 건드리지 않음
    await supabase
      .from('user_alert_rules')
      .update({
        region_tags: payload.region_tags,
        age_tags: payload.age_tags,
        occupation_tags: payload.occupation_tags,
        benefit_tags: payload.benefit_tags,
        household_tags: payload.household_tags,
        channels: payload.channels,
      })
      .eq('id', existing.id);
  } else {
    // 자동 규칙이 없으면 신규 생성
    await supabase.from('user_alert_rules').insert(payload);
  }
}
