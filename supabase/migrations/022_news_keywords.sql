-- ============================================================
-- 022: news_posts.keywords 컬럼 추가
-- ============================================================
-- korea.kr 메인 "키워드로 찾아보는 정책뉴스" 섹션처럼 주요 정책 토픽별로
-- 뉴스 묶어 보여주기 위한 태그. benefit_tags(혜택 분야 12종) 와 별개로
-- 실용 정책 키워드 (청년·소상공인·추경·AI·에너지 등 30여 개).
--
-- Phase 2 에서 /news/keyword/[term] 페이지로 활용 예정.
-- ============================================================

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}';

-- 키워드별 필터링에 GIN 인덱스 — /news/keyword/[term] 조회 성능
CREATE INDEX IF NOT EXISTS idx_news_keywords_gin
  ON public.news_posts USING GIN (keywords);

COMMENT ON COLUMN public.news_posts.keywords
  IS '정책 주요 키워드 태그 (lib/news-keywords.ts 사전 기반 추출).';
