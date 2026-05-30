-- ============================================================
-- 105: news 자체 해설 박스용 AI commentary 컬럼 (P2)
-- ============================================================
-- 목적: news 상세 페이지에 "이 뉴스가 시민에게 의미하는 것" 자체 해설을
-- 담는다. 외부 보도자료 원본만으로는 keepioo originality 약함 → AdSense
-- "scaled content" 정책 의심 표면. ai_commentary 채워진 row 만 noindex
-- 해제(selective noindex 강화).
-- NULL = 백필 미완료 → NewsCommentaryBox 미표시. selective noindex 유지.
-- 104 (welfare/loan 의 ai_tips/faq/checklist) 와 같은 패턴. news 는 더 짧은
-- 단락이라 1 컬럼.

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS ai_commentary TEXT;

COMMENT ON COLUMN news_posts.ai_commentary IS
  'AI 생성 자체 해설 (시민에게 의미하는 것 + 관련 정책 신청 동선 한 단락).
   NULL=미백필. 채워진 row 만 selective noindex 해제 후보(P2 cron 진행에 따라).';

-- selective noindex 강화 (P0 기존 isThin = !summary || !classified_at 와 결합):
-- ai_commentary IS NULL → noindex follow 유지 (P2 cron 으로 채워지면 자동 index 후보).
-- 마이그레이션 자체에 트리거는 없음. app/news/[slug]/page.tsx 의 isThin 분기에서 활용.
