-- 072: 워드프레스 자동 발행 로그
--
-- 매일 keepioo blog_posts insert 직후 워드프레스에도 자동 발행 (REST API).
-- 네이버 블로그 큐와 다른 점: 네이버는 사장님 수동 발행 (API 부재) → 큐 형태,
-- 워드프레스는 REST API 100% 자동 → 발행 이력만 기록 (큐 X).
--
-- 흐름:
--   1) blog_posts insert 직후 publishToWordPress() 자동 호출
--   2) WP REST API POST /wp-json/wp/v2/posts (제목·본문·tags·category)
--   3) 응답의 워드프레스 post ID·URL 을 wordpress_publish_log 에 INSERT
--   4) 발행 실패 시 status='failed' + error_message 기록 (재시도 별도 cron 검토)
--
-- 중복 방지: blog_post_id UNIQUE — 같은 글이 두 번 워드프레스에 올라가지 않음

CREATE TABLE IF NOT EXISTS public.wordpress_publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'failed', 'skipped')),

  -- 워드프레스 응답에서 받은 글 정보 (추적용)
  wp_post_id integer,
  wp_post_url text,

  -- 발행 메타
  published_at timestamptz,
  failed_at timestamptz,
  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wordpress_publish_log_blog_uniq UNIQUE (blog_post_id)
);

-- 어드민 페이지가 status='published' 를 published_at desc 로 조회 (최근 발행)
CREATE INDEX IF NOT EXISTS idx_wordpress_publish_log_published
  ON public.wordpress_publish_log(published_at DESC)
  WHERE status = 'published';

-- 실패 모니터링용
CREATE INDEX IF NOT EXISTS idx_wordpress_publish_log_failed
  ON public.wordpress_publish_log(failed_at DESC)
  WHERE status = 'failed';

ALTER TABLE public.wordpress_publish_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wordpress_publish_log IS
  '워드프레스 자동 발행 이력. service_role 서버 경로에서만 접근. 사장님 wordpress.com REST API 호출 결과 기록.';
COMMENT ON COLUMN public.wordpress_publish_log.wp_post_id IS
  '워드프레스 응답의 post.id (정수). 추후 update/delete 시 사용.';
COMMENT ON COLUMN public.wordpress_publish_log.wp_post_url IS
  '워드프레스 발행된 글의 공개 URL. 예: https://keepioopolicy.wordpress.com/2026/05/07/...';
