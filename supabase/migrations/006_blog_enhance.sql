-- ============================================================
-- 블로그 자동 발행 시스템 — blog_posts 테이블 보강
-- ============================================================
-- 기존 blog_posts (001_initial_schema.sql) 컬럼:
--   id, slug, title, content, meta_description, tags[], view_count, published_at, created_at
--
-- AdSense 승인을 위해 추가:
--   - category: 청년/소상공인/주거/육아/노년/학생/큐레이션 등
--   - faqs: FAQPage 구조화 데이터용 (Q&A 배열)
--   - cover_image: 대표 이미지 URL (optional)
--   - reading_time_min: 예상 읽기 시간 (분)
--   - updated_at: 마지막 수정 시각 (Article 구조화 데이터의 dateModified)
--   - source_program_id: 어떤 정책에서 파생됐는지 (중복 방지용)
--   - source_program_type: welfare / loan / curation
-- ============================================================

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS reading_time_min INT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_program_id UUID,
  ADD COLUMN IF NOT EXISTS source_program_type TEXT
    CHECK (source_program_type IS NULL OR source_program_type IN ('welfare', 'loan', 'curation'));

-- updated_at 자동 갱신 트리거 (set_updated_at 함수는 005_subscriptions.sql 에서 정의)
DROP TRIGGER IF EXISTS blog_posts_set_updated_at ON blog_posts;
CREATE TRIGGER blog_posts_set_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 카테고리·발행 시기로 빠른 조회 (목록 페이지용)
CREATE INDEX IF NOT EXISTS idx_blog_posts_category_published
  ON blog_posts(category, published_at DESC)
  WHERE published_at IS NOT NULL;

-- 자동 발행 cron 이 같은 정책 두 번 글로 안 만들도록
CREATE INDEX IF NOT EXISTS idx_blog_posts_source
  ON blog_posts(source_program_type, source_program_id)
  WHERE source_program_id IS NOT NULL;

-- ============================================================
-- INSERT 권한 (service_role 만, RLS 는 이미 enabled)
-- 공개 SELECT 정책은 001 에서 이미 생성됨 (blog_posts_read)
-- ============================================================
