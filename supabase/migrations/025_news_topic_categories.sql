-- ============================================================
-- 025_news_topic_categories
-- ============================================================
-- news_posts 에 korea.kr "키워드 뉴스" 페이지 기준 15개 주제 분류 저장.
--
-- 배경: korea.kr 의 customizedNewsList.do 는 3축(대상별/주제별/핫이슈) 의
-- 15개 카테고리(영유아·아동·청소년, 청년·대학생, 어르신, 일자리, 복지, 문화,
-- 소상공인 지원, 청년정책 등) 로 뉴스를 분류해 제공. 기존 keywords 컬럼은
-- keepioo 자체 도메인 키워드(24개 · 월세·대출·청년 등) 와 맞물려 있어
-- UI 탭용 주제 분류와는 별개로 관리.
--
-- 한 뉴스가 여러 카테고리에 동시에 속할 수 있음 (예: "청년 창업 월세 지원"
-- → [청년·대학생, 일자리, 주거] 3개). text[] 로 저장.
-- ============================================================

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS topic_categories text[] NOT NULL DEFAULT '{}';

-- GIN 인덱스 — `topic_categories @> ARRAY['청년·대학생']` 필터가 카테고리 페이지
-- 쿼리의 주 패턴. 건수 증가 시 full scan 방지.
CREATE INDEX IF NOT EXISTS idx_news_posts_topic_categories
  ON news_posts USING gin (topic_categories);
