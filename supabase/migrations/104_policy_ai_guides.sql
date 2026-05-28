-- ============================================================
-- 104: 정책 상세 자체 가치 박스용 AI 가이드 컬럼
-- ============================================================
-- 목적: welfare/loan 상세 11K 페이지에 「이용 팁」「자주 묻는 거절 사유」
-- 「신청 체크리스트」 자체 콘텐츠를 담는다. AdSense "가치 콘텐츠" 강화.
-- NULL = 백필 미완료 → PolicyGuideBox 가 template fallback.

ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS ai_tips TEXT,
  ADD COLUMN IF NOT EXISTS ai_faq TEXT,
  ADD COLUMN IF NOT EXISTS ai_checklist TEXT;

ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS ai_tips TEXT,
  ADD COLUMN IF NOT EXISTS ai_faq TEXT,
  ADD COLUMN IF NOT EXISTS ai_checklist TEXT;

COMMENT ON COLUMN welfare_programs.ai_tips IS 'AI 생성 이용 팁 (자체 콘텐츠). NULL=미백필.';
COMMENT ON COLUMN welfare_programs.ai_faq IS 'AI 생성 자주 묻는 거절 사유. NULL=미백필.';
COMMENT ON COLUMN welfare_programs.ai_checklist IS 'AI 생성 신청 체크리스트. NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_tips IS 'AI 생성 이용 팁 (자체 콘텐츠). NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_faq IS 'AI 생성 자주 묻는 거절 사유. NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_checklist IS 'AI 생성 신청 체크리스트. NULL=미백필.';
