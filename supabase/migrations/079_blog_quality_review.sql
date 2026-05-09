-- 079: A1 — 블로그 발행 자동 검수 (LLM 품질 평가)
--
-- 매일 발행된 블로그 글에 대해 Claude Haiku 가 1~5 점 품질 평가.
-- score ≤ 2 (광고성·오류 의심) 인 글 admin_review_required=true 마킹 →
-- /admin/blog 에서 사장님 검수 큐. 평균 점수 운영 통계.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS admin_review_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_review_score INT
    CHECK (admin_review_score IS NULL OR (admin_review_score BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ;

-- 검수 큐 빠른 조회 (admin_review_required=true 인 글만 매우 적을 거라 partial index 효율)
CREATE INDEX IF NOT EXISTS idx_blog_posts_review_required
  ON public.blog_posts(admin_review_required, published_at DESC)
  WHERE admin_review_required = true;

COMMENT ON COLUMN public.blog_posts.admin_review_required IS
  'A1 — LLM 검수 결과 score ≤ 2 인 경우 true. 사장님 /admin/blog 검수 큐 표시.';
COMMENT ON COLUMN public.blog_posts.admin_review_score IS
  'A1 — Claude Haiku 1~5 점 평가. NULL = 미검수. 5 = 우수.';
