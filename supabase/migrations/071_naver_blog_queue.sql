-- 071: 네이버 블로그 발행 큐
--
-- keepioo 자동 발행 블로그 글을 네이버 블로그에 백링크용으로 재발행하기 위한 큐.
-- 네이버 블로그는 공식 글쓰기 API 가 없어 사장님이 사장님 브라우저로 직접 발행.
-- 어드민 /admin/naver-blog 페이지가 이 큐를 보여주고, 사장님이 발행 후 상태 변경.
--
-- 흐름:
--   1) blog_posts insert 직후 자동으로 naver_blog_queue 에 pending 행 추가
--   2) 어드민 페이지에서 변환된 plain text + keepioo 백링크 미리보기·복사
--   3) 사장님이 네이버 블로그에 붙여넣기 + 게시 → "발행 완료" 버튼 클릭
--   4) status='published' 로 update + naver_url 저장 (추적용)
--
-- 중복 방지: blog_post_id UNIQUE — 같은 글이 두 번 큐에 들어가지 않음

CREATE TABLE IF NOT EXISTS public.naver_blog_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'skipped')),

  -- 사장님이 게시한 네이버 블로그 글 URL (확인용, 선택)
  naver_url text,

  -- 발행/스킵 처리 메타
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  skipped_at timestamptz,
  skipped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  skip_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT naver_blog_queue_blog_uniq UNIQUE (blog_post_id)
);

-- 어드민 페이지가 status='pending' 을 created_at desc 로 조회
CREATE INDEX IF NOT EXISTS idx_naver_blog_queue_pending
  ON public.naver_blog_queue(status, created_at DESC);

-- 발행 이력 추적용 — 사장님이 "이번 달 몇 건 발행" 같은 통계 볼 때
CREATE INDEX IF NOT EXISTS idx_naver_blog_queue_published
  ON public.naver_blog_queue(published_at DESC)
  WHERE status = 'published';

ALTER TABLE public.naver_blog_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.naver_blog_queue IS
  '네이버 블로그 발행 큐. service_role 서버 경로에서만 접근. 사장님이 어드민에서 발행 후 상태 변경.';
COMMENT ON COLUMN public.naver_blog_queue.naver_url IS
  '사장님이 네이버 블로그에 게시 후 직접 입력하는 글 URL. 추적용 — 미입력 허용.';
