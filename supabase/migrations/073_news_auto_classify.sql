-- 073: 뉴스 자동 모더레이션 분류 추적 컬럼
--
-- LLM (Claude Haiku) 자동 분류 cron 이 처리한 뉴스를 표시.
-- 같은 글 반복 분류 비용 방지 + 운영 통계 (auto-classified N건/일).
--
-- 분류 결과:
--   1) 광고성 (advertorial): 자동 hide + hidden_reason='자동: 광고성'
--   2) 저작권 위반 의심: 자동 hide + hidden_reason='자동: 저작권 의심'
--   3) 정상: classified_at 만 update (visible 유지)
--
-- 사장님 부담:
--   - 자동 hide 된 글은 어드민 검수 큐에 표시 → 사장님이 reverse 가능
--   - 사장님이 visible 결정한 글은 다시 자동 분류 안 함 (classified_at 보호)

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_classify_reason text;

COMMENT ON COLUMN public.news_posts.classified_at IS
  'LLM 자동 분류 시각. NULL = 미분류. cron 이 NULL 만 처리해 중복 비용 방지.';
COMMENT ON COLUMN public.news_posts.auto_classify_reason IS
  'LLM 분류 사유 (예: "광고성_단정", "저작권_의심", "정상"). hidden_reason 과 별개로 자동 분류 추적용.';

-- 미분류 뉴스 빠른 조회용 — cron 이 매번 SELECT 시 효율
CREATE INDEX IF NOT EXISTS idx_news_posts_unclassified
  ON public.news_posts(created_at DESC)
  WHERE classified_at IS NULL AND is_hidden = false;
