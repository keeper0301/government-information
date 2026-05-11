-- ============================================================
-- 인스타그램 자동 발행 추적 컬럼
-- ============================================================
-- blog_posts 새 글 발행 시 → cron 이 5분 안에 인스타 carousel 발행.
-- 발행 상태/시각/에러 추적해서 admin/instagram 페이지에 표시.
-- ============================================================

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS instagram_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_error TEXT,
  ADD COLUMN IF NOT EXISTS instagram_attempt_count INT NOT NULL DEFAULT 0;

-- cron 이 빠르게 미발행 글 찾도록 인덱스 (published_at IS NOT NULL AND instagram_published_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_blog_posts_instagram_pending
  ON blog_posts (published_at DESC)
  WHERE published_at IS NOT NULL
    AND instagram_published_at IS NULL
    AND instagram_attempt_count < 3;

-- 발행된 글 id 조회용 (admin 페이지)
CREATE INDEX IF NOT EXISTS idx_blog_posts_instagram_published
  ON blog_posts (instagram_published_at DESC NULLS LAST)
  WHERE instagram_media_id IS NOT NULL;

COMMENT ON COLUMN blog_posts.instagram_published_at IS '인스타 carousel 발행 완료 시각. NULL = 미발행';
COMMENT ON COLUMN blog_posts.instagram_media_id IS '인스타 Graph API 반환 media_id (https://www.instagram.com/p/{shortcode} 조회 용)';
COMMENT ON COLUMN blog_posts.instagram_error IS '마지막 실패 사유 (null = 성공 또는 미시도)';
COMMENT ON COLUMN blog_posts.instagram_attempt_count IS '발행 시도 횟수. 3회 실패 시 cron 이 더 시도 안 함';
