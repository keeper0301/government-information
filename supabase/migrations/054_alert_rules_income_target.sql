-- ============================================================
-- 054_alert_rules_income_target — 알림 룰에 소득 매칭 컬럼 추가
-- ============================================================
-- Phase E (Phase 1.5 활용 5종 중 마지막) — 사용자별 알림 룰이 income 매칭 가능.
-- household 는 이미 user_alert_rules.household_tags 로 매칭 중 (lib/alerts/matching.ts).
-- income 만 추가하면 Phase 1.5 정밀 매칭 알림 완성.
--
-- NULL 이면 매칭 무관 (기존 룰 동작 보존). 'low/mid_low/mid/any' 중 하나면
-- welfare/loan.income_target_level 과 정확 매칭.
--
-- 효과:
--   - 이메일 알림 (활성): 즉시 정밀화
--   - 카카오 알림톡 (POLICY_NEW v2 심사 대기): 승인 후 자동 정밀화
--
-- 회귀 위험 0 — 컬럼 nullable + 기존 룰 모두 NULL → 매칭 로직 변화 없음.
-- ============================================================

ALTER TABLE user_alert_rules ADD COLUMN income_target TEXT
  CHECK (income_target IN ('low','mid_low','mid','any') OR income_target IS NULL);
COMMENT ON COLUMN user_alert_rules.income_target IS
  'Phase 1.5 income 매칭 — NULL 이면 무관, 그 외엔 welfare/loan.income_target_level 과 정확 매칭';
