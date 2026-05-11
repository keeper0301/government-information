-- ============================================================
-- 086 Instagram OAuth tokens 저장 테이블
-- ============================================================
-- 2026-05-11 인스타 자동 발행 cron 의 INSTAGRAM_ACCESS_TOKEN env 미등록 →
-- OAuth flow 로 long-lived token 자동 발급 + DB 저장.
--
-- 흐름:
--   /api/instagram/oauth/start → Instagram authorize → callback
--   → short-lived token (1hr) → long-lived (60일) → 이 테이블에 저장
--   → cron 이 DB 읽어서 발행 + 60일 만료 7일 전 auto refresh
--
-- single row 또는 multi-account 둘 다 지원 (ig_user_id PK).
-- 사장님 1인 운영이지만 향후 다른 인스타 추가 가능성 위해.
-- ============================================================

CREATE TABLE IF NOT EXISTS instagram_oauth_tokens (
  ig_user_id TEXT PRIMARY KEY,            -- Instagram Business Account ID
  access_token TEXT NOT NULL,             -- long-lived (60일)
  expires_at TIMESTAMPTZ NOT NULL,        -- token 만료 시각 (60일 후)
  refreshed_at TIMESTAMPTZ,               -- 마지막 refresh 시각 (null = 첫 발급 이후 한 번도 안 함)
  username TEXT,                          -- 표시용 (admin UI)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE instagram_oauth_tokens IS
  'Instagram OAuth long-lived token 저장. cron 발행 + auto refresh 가 이 테이블 사용.';
COMMENT ON COLUMN instagram_oauth_tokens.ig_user_id IS
  'Instagram Business Account ID (Graph API /me 응답의 id)';
COMMENT ON COLUMN instagram_oauth_tokens.access_token IS
  'Long-lived access token (60일 만료). refresh 가능 (graph.instagram.com/refresh_access_token).';

-- RLS — anon 완전 차단, service_role 만 RW
ALTER TABLE instagram_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- service_role 만 SELECT (cron 이 token 읽음)
CREATE POLICY "instagram_oauth_tokens_service_only"
  ON instagram_oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_instagram_oauth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_update_instagram_oauth_tokens_updated_at
  ON instagram_oauth_tokens;
CREATE TRIGGER trigger_update_instagram_oauth_tokens_updated_at
  BEFORE UPDATE ON instagram_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_instagram_oauth_tokens_updated_at();

-- 만료 임박 token 빠른 조회용 인덱스 (refresh cron)
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_tokens_expires_at
  ON instagram_oauth_tokens (expires_at);
