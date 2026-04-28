-- ============================================================
-- 065_news_dedupe_hash.sql — 뉴스 중복 제거 시스템 (Phase 5)
-- ============================================================
-- 사고 (2026-04-28): 같은 행사·정책에 대한 다른 출처 뉴스가 news_posts 에
-- 모두 INSERT 되어 /news 에 중복 노출. application 후처리 (ec41cd7) 만으로는
-- 페이지 분산·count 불일치 한계. DB INSERT 단계에서 차단하는 인프라 추가.
--
-- 변경:
--   1) news_posts.dedupe_hash 컬럼 추가 — 한국어 bigram set 직렬화 hash
--   2) idx_news_posts_dedupe_hash — 7일 window lookup 가속
--   3) news_posts_deduped view — DISTINCT ON 안전망 (cron skip 가 못 잡은
--      동시 INSERT 경합 대비)
--
-- 백필: dedupe_hash 는 한국어 bigram + jaccard 계산이 application 코드라
-- DB SQL 만으로 채울 수 없음. 마이그레이션 적용 후 별도 endpoint
-- (/admin/news/backfill-dedupe) 로 사장님이 수동 trigger.
-- ============================================================

-- 1) 컬럼 추가 (NULL 허용 — 백필 전까지 기존 row 는 NULL)
ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS dedupe_hash TEXT;

COMMENT ON COLUMN public.news_posts.dedupe_hash IS
  'lib/news-dedupe.ts computeDedupeHash() 결과 (한국어 bigram set 정렬 string). NULL 인 row 는 백필 대상.';

-- 2) 인덱스 — published_at DESC 와 함께 (7일 window 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_news_posts_dedupe_hash
  ON public.news_posts (dedupe_hash, published_at DESC)
  WHERE dedupe_hash IS NOT NULL;

-- 3) DB view 안전망
-- DISTINCT ON 이 같은 hash 중 published_at 가장 최근 1건만 노출.
-- 백필 진행 중에도 NULL row 가 사라지지 않도록 COALESCE(dedupe_hash, id::text)
-- — NULL row 는 자기 id 가 키라 모두 통과 (중복 제거 효과는 hash 채워진 row 부터).
CREATE OR REPLACE VIEW public.news_posts_deduped AS
SELECT DISTINCT ON (COALESCE(dedupe_hash, id::text)) *
FROM public.news_posts
WHERE is_hidden = false
ORDER BY COALESCE(dedupe_hash, id::text), published_at DESC NULLS LAST;

GRANT SELECT ON public.news_posts_deduped TO anon, authenticated;

COMMENT ON VIEW public.news_posts_deduped IS
  'cron INSERT 전 dedupe skip (lib/news-dedupe.ts) 의 안전망. 같은 dedupe_hash 중 가장 최근 published_at 1건만 노출.';
