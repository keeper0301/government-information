-- Instagram Reels 자동 발행 상태 컬럼
-- 사전 렌더링된 public MP4 URL 이 있는 blog_posts 만 릴스 발행 대상으로 삼는다.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS instagram_reel_video_url text,
  ADD COLUMN IF NOT EXISTS instagram_reel_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS instagram_reel_media_id text,
  ADD COLUMN IF NOT EXISTS instagram_reel_error text,
  ADD COLUMN IF NOT EXISTS instagram_reel_attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_blog_posts_instagram_reels_pending
  ON public.blog_posts (published_at ASC)
  WHERE published_at IS NOT NULL
    AND instagram_reel_video_url IS NOT NULL
    AND instagram_reel_published_at IS NULL
    AND instagram_reel_attempt_count < 3;

CREATE INDEX IF NOT EXISTS idx_blog_posts_instagram_reels_published
  ON public.blog_posts (instagram_reel_published_at DESC NULLS LAST);

COMMENT ON COLUMN public.blog_posts.instagram_reel_video_url IS
  'Instagram Reels 발행용 public HTTPS MP4 URL. NULL 이면 릴스 자동 발행 대상 아님';
COMMENT ON COLUMN public.blog_posts.instagram_reel_published_at IS
  'Instagram Reels 발행 완료 시각. NULL = 미발행';
COMMENT ON COLUMN public.blog_posts.instagram_reel_media_id IS
  'Instagram Graph API Reels media_id';
COMMENT ON COLUMN public.blog_posts.instagram_reel_error IS
  'Instagram Reels 마지막 실패 사유';
COMMENT ON COLUMN public.blog_posts.instagram_reel_attempt_count IS
  'Instagram Reels 발행 시도 횟수. 3회 실패 시 cron 이 더 시도 안 함';
