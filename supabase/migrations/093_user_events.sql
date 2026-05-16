-- ============================================================
-- 093: user_events 테이블 신설 (Phase A 클릭 분석)
-- ============================================================
-- 사용자 click 데이터 누적 → 추천 정확도 자동 학습.
-- 익명 사용자도 (user_id NULL) 추적 가능 — 트래픽 분석.
--
-- event_type:
--   - 'program_view': 정책 상세 페이지 진입
--   - 'apply_click': 신청 link 클릭 (apply_url 도착 직전)
--   - 'recommend_click': /recommend 결과에서 정책 카드 클릭
--   - 'home_recommend_click': 홈 추천 섹션 클릭
-- ============================================================

CREATE TABLE IF NOT EXISTS user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'program_view', 'apply_click', 'recommend_click', 'home_recommend_click'
  )),
  program_id UUID,
  program_table TEXT CHECK (program_table IN ('welfare_programs', 'loan_programs', 'news_posts')),
  source_page TEXT, -- 어떤 페이지에서 발생했는지 ('/welfare/X', '/recommend', '/' 등)
  user_agent TEXT, -- 익명 분석용 (디바이스 type)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용자별 최근 활동 query
CREATE INDEX IF NOT EXISTS user_events_user_id_created_idx
  ON user_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- 정책별 인기 추적 query
CREATE INDEX IF NOT EXISTS user_events_program_idx
  ON user_events (program_table, program_id, event_type)
  WHERE program_id IS NOT NULL;

-- 일별 집계 query
CREATE INDEX IF NOT EXISTS user_events_created_at_idx
  ON user_events (created_at DESC);

COMMENT ON TABLE user_events IS
  '사용자 click event 누적. 추천 정확도 학습 + 인기 정책 분석. user_id NULL = 익명.';

-- RLS — 본인 events 만 SELECT. INSERT 는 endpoint 가 service_role 로 처리.
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_events_select_own"
  ON user_events FOR SELECT
  USING (auth.uid() = user_id);

-- anon 도 INSERT 불가 — endpoint 가 admin client 로 보호 (service_role).
-- 이 패턴은 다른 audit (admin_actions) 와 동일.
