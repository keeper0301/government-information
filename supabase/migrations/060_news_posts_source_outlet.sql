-- ============================================================
-- 060: news_posts.source_outlet — 원 언론사 표기
-- ============================================================
-- 배경:
--   /news 목록·상세에서 korea.kr 정책뉴스(공공누리)와 네이버 검색 수집 뉴스가
--   같은 카드 그리드에 혼재 노출. 네이버 검색 결과는 원 저작권이 각 언론사에
--   있어 저작권법 제37조(출처 명시) + 네이버 OpenAPI 약관(원문 출처 표시)
--   이행을 위해 언론사명·도메인을 사용자에게 노출해야 함.
--
-- 컬럼:
--   source_outlet text NULL — 도메인 또는 한국어 라벨 (예: "donga.com", "동아일보")
--                              NULL 이면 미상(예: korea.kr 의 경우 ministry 가 발신처).
--
-- 백필:
--   네이버 수집분(source_code LIKE 'naver-news-%') 은 source_url 의 hostname 추출.
--   korea.kr 수집분은 NULL 유지 (ministry 컬럼이 발신 부처를 제공).
--
-- 부작용 없음:
--   - 단순 컬럼 추가, 기존 인덱스·RLS 영향 없음.
--   - 백필은 idempotent — 다시 돌려도 같은 결과.
-- ============================================================

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS source_outlet text;

COMMENT ON COLUMN public.news_posts.source_outlet IS
  '원 언론사 도메인 또는 한국어 라벨. 네이버 검색 수집분 출처 명시(저작권법 제37조). korea.kr 수집분은 NULL.';

-- 백필: 네이버 검색 수집분에서 source_url hostname 만 추출 (예: www.donga.com → donga.com).
-- 정규식: 'https?://([^/]+)/' 매치 후 'www.' prefix 제거.
UPDATE public.news_posts
SET source_outlet = regexp_replace(
  regexp_replace(source_url, '^https?://(www\.|news\.)?', ''),
  '/.*$',
  ''
)
WHERE source_code LIKE 'naver-news-%'
  AND source_outlet IS NULL
  AND source_url IS NOT NULL;
