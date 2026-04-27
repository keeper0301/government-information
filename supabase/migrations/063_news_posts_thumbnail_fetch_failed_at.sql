-- ============================================================
-- 063: news_posts.thumbnail_fetch_failed_at — og:image 추출 실패 표식
-- ============================================================
-- 배경:
--   naver-news-* 의 thumbnail_url=NULL row 7,200건 백필을 위해
--   /api/enrich-thumbnails cron 추가. 외부 사이트 fetch 실패(timeout·404)
--   row 에 표식 남겨 다음 cron 즉시 재시도 X (7d cooldown).
--
-- 컬럼:
--   thumbnail_fetch_failed_at timestamptz NULL
--   - NULL: 시도 안 했거나 성공
--   - 값: 마지막 실패 시각 (7d 지나면 enrich cron 이 다시 후보로 선정)
--
-- 부작용:
--   - 단순 컬럼 추가, 기존 인덱스/RLS 영향 0
--   - 실패 패턴이 영구 사이트 차단(robots.txt 등) 이라도 7d 마다 재시도해
--     CDN 회복·정책 변경 자동 반영
-- ============================================================

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS thumbnail_fetch_failed_at timestamptz;

COMMENT ON COLUMN public.news_posts.thumbnail_fetch_failed_at IS
  'og:image 추출 실패 시각 (7d cooldown 후 재시도). enrich-thumbnails cron 사용.';
