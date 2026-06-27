-- Instagram Reels 영상 생성 attempt 상태 컬럼

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS instagram_reel_render_attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_blog_posts_instagram_reel_render_pending
  ON public.blog_posts (published_at ASC)
  WHERE published_at IS NOT NULL
    AND instagram_reel_video_url IS NULL
    AND instagram_reel_published_at IS NULL
    AND instagram_reel_render_attempt_count < 3;

COMMENT ON COLUMN public.blog_posts.instagram_reel_render_attempt_count IS
  'Instagram Reels MP4 영상 생성/업로드 시도 횟수. 3회 실패 시 renderer cron 이 더 시도 안 함';
