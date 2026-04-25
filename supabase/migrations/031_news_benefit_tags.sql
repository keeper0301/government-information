-- 031_news_benefit_tags.sql
-- news_posts 에 benefit_tags 배열 컬럼 추가 (BENEFIT_TAGS 14종 저장).
-- 기존 topic_categories 는 deprecated (코드 정리 후 별도 마이그레이션으로 제거).
-- ROLLBACK: ALTER TABLE news_posts DROP COLUMN benefit_tags;

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS news_posts_benefit_tags_idx
  ON news_posts USING GIN (benefit_tags);

COMMENT ON COLUMN news_posts.benefit_tags IS
  'BENEFIT_TAGS 14종 (lib/tags/taxonomy.ts). retag-news-benefit-tags.ts 로 일괄 채움.';
