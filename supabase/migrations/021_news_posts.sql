-- ============================================================
-- 021: news_posts — korea.kr 정책 뉴스·보도자료·정책자료 큐레이션
-- ============================================================
-- 목적:
--   - 공고(welfare·loan) 의 보완재 — "정책 발표 흐름" 을 뉴스 형태로 제공
--   - AdSense 인벤토리·SEO 유입·체류시간 증가
--   - 상세 페이지에서 "이 뉴스 관련 공고" 자동 매칭해 공고 클릭 유도
--
-- 콘텐츠 출처: korea.kr RSS (공공누리 제1유형, 상업이용·출처표시)
--   - 정책뉴스 /rss/policy.xml        → category='news'
--   - 보도자료 /rss/pressrelease.xml  → category='press'
--   - 전문자료 /rss/expdoc.xml        → category='policy-doc'
--
-- 공급 정책:
--   - cron 이 /api/collect-news 에서 RSS 긁어 upsert
--   - source_id = RSS guid (newsId)
--   - 본문은 RSS description 원본 그대로 저장, 표시 때 cleanDescription
--   - license 컬럼으로 공공누리 명시 (푸터에 출처·라이선스 표기 의무)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 소스 식별
  source_code text NOT NULL,           -- 'korea-kr-policy' | 'korea-kr-press' | 'korea-kr-expdoc'
  source_id text NOT NULL,             -- RSS guid 또는 newsId
  source_url text NOT NULL,            -- 원문 링크
  license text NOT NULL DEFAULT 'KOGL-Type1',

  -- 분류
  category text NOT NULL               -- 'news' | 'press' | 'policy-doc'
    CHECK (category IN ('news','press','policy-doc')),
  ministry text,                        -- 보도자료 제목의 [과기정통부] 추출
  benefit_tags text[] DEFAULT '{}',     -- taxonomy.ts BENEFIT_TAGS 기준

  -- 콘텐츠
  title text NOT NULL,
  summary text,                         -- 목록/카드용 짧은 요약 (cleanDescription 후 앞 200자)
  body text,                            -- 상세 페이지 본문 (HTML 정제 후 텍스트)
  thumbnail_url text,                   -- RSS body 의 <img> src 첫 번째
  slug text NOT NULL UNIQUE,            -- URL 용 slug (makeSlug)

  -- 시간
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 관찰
  view_count integer NOT NULL DEFAULT 0,

  CONSTRAINT news_posts_source_uniq UNIQUE (source_code, source_id)
);

-- 조회 패턴: 카테고리별 최신순, 전체 최신순, slug lookup
CREATE INDEX IF NOT EXISTS idx_news_published ON public.news_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_cat_published ON public.news_posts (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_slug ON public.news_posts (slug);
CREATE INDEX IF NOT EXISTS idx_news_ministry_published ON public.news_posts (ministry, published_at DESC) WHERE ministry IS NOT NULL;

-- GIN 인덱스 — benefit_tags 배열 검색 (관련 공고 매칭용)
CREATE INDEX IF NOT EXISTS idx_news_benefit_tags_gin ON public.news_posts USING GIN (benefit_tags);

-- RLS: 공개 SELECT, INSERT/UPDATE/DELETE 는 service_role 만
ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_posts_public_select ON public.news_posts;
CREATE POLICY news_posts_public_select ON public.news_posts
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.news_posts IS 'korea.kr 정책 뉴스·보도자료·정책자료 큐레이션. 공공누리 제1유형.';
COMMENT ON COLUMN public.news_posts.source_code IS '수집 소스 식별. korea-kr-policy / korea-kr-press / korea-kr-expdoc';
COMMENT ON COLUMN public.news_posts.category IS 'news(정책뉴스) | press(보도자료) | policy-doc(정책자료·전문자료)';
COMMENT ON COLUMN public.news_posts.license IS '원본 라이선스. 공공누리(KOGL) Type 1: 출처표시, 상업이용·변형 허용.';
