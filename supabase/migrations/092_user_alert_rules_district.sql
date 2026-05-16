-- ============================================================
-- 092: user_alert_rules.district 컬럼 추가 (Phase E-A)
-- ============================================================
-- 사용자 알림 자동화 — 거주지 시·군 정확 매칭.
-- 현재 region_tags (광역 단위) 만으로 매칭. welfare/loan 의 district
-- (migration 090) 와 시·군 단위 정확 매칭하려면 컬럼 필요.
--
-- destructive 안 함:
--   - NULLable 컬럼 (기존 row 영향 0)
--   - partial index (NULL 제외, 부담 0)
--   - 기존 matching logic 호환 (district NULL 이면 광역만 매칭)
--
-- auto-rule.ts 가 user_profiles.district 갱신 시 자동 채움.
-- matching.ts 가 program.district 와 매칭 시 +1 시그널.
-- ============================================================

ALTER TABLE user_alert_rules
  ADD COLUMN IF NOT EXISTS district VARCHAR(20);

CREATE INDEX IF NOT EXISTS user_alert_rules_district_idx
  ON user_alert_rules (district)
  WHERE district IS NOT NULL;

COMMENT ON COLUMN user_alert_rules.district IS
  '사용자 거주 시·군·구 (예: 순천시). welfare/loan.district 와 정확 매칭 시 알림. NULL = 광역 단위만 매칭.';
