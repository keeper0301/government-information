-- ============================================================
-- 083 정책 unique_insight 컬럼 (AdSense thin/scaled content 거절 대응)
-- ============================================================
-- 2026-05-10 AdSense "가치 별로 없는 콘텐츠" 거절 대응. 정부 원문 description
-- 외에 keepioo 자체 해설 (핵심 정의·대상자·신청 함정·실무 팁) 5~7줄을
-- 별도 컬럼에 저장 → "재게시 사이트" 시그널 차단, 큐레이션 가치 가시화.
--
-- 백필 cron: /api/cron/policy-insight-backfill (매일 KST 09:00, 일 100건)
-- LLM: gpt-4o-mini, 정책당 ~400 토큰 (월 비용 약 $3 추정 — 100건 × 30일)
-- 진행률: NULL row 우선순위 인덱스로 빠르게 추출, 약 4개월 후 11k 정책 100% 완료
-- ============================================================

-- welfare_programs
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS unique_insight TEXT;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS unique_insight_at TIMESTAMPTZ;
ALTER TABLE welfare_programs ADD COLUMN IF NOT EXISTS unique_insight_model TEXT;

-- loan_programs
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS unique_insight TEXT;
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS unique_insight_at TIMESTAMPTZ;
ALTER TABLE loan_programs ADD COLUMN IF NOT EXISTS unique_insight_model TEXT;

-- 백필 cron 진행률 추적용 partial 인덱스 — NULL row 빠른 추출.
-- 월 ~3,000건 백필 → row 수 천천히 줄어듦. partial 이라 인덱스 작음.
CREATE INDEX IF NOT EXISTS idx_welfare_insight_backfill
  ON welfare_programs (updated_at DESC)
  WHERE unique_insight IS NULL;

CREATE INDEX IF NOT EXISTS idx_loan_insight_backfill
  ON loan_programs (updated_at DESC)
  WHERE unique_insight IS NULL;

COMMENT ON COLUMN welfare_programs.unique_insight IS
  'keepioo 자체 해설 (5~7줄, AdSense 큐레이션 시그널). 백필 cron 으로 자동 채움.';
COMMENT ON COLUMN loan_programs.unique_insight IS
  'keepioo 자체 해설 (5~7줄, AdSense 큐레이션 시그널). 백필 cron 으로 자동 채움.';
