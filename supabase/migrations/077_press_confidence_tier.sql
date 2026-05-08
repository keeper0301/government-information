-- 077: 광역 보도자료 L2 자동 confirm 신뢰도 tier + 회수 메커니즘
--
-- spec: docs/superpowers/specs/2026-05-08-press-ingest-confidence-tier-design.md
--
-- 1) press_ingest_candidates 에 confidence_tier 추가 + status enum 'revoked' 확장
-- 2) welfare_programs / loan_programs 양쪽에 자동 등록 메타 + soft hide + 회수 audit 컬럼
-- 3) RLS 갱신 — 028 news_posts 패턴 (USING (is_hidden = false))
-- 4) 인덱스 — 자동 등록 최근 N일 조회 + 사용자 노출 partial index

-- ─── press_ingest_candidates ────────────────────────────────
ALTER TABLE public.press_ingest_candidates
  ADD COLUMN IF NOT EXISTS confidence_tier TEXT
    CHECK (confidence_tier IS NULL OR confidence_tier IN ('high', 'mid', 'low'));

ALTER TABLE public.press_ingest_candidates
  DROP CONSTRAINT IF EXISTS press_ingest_candidates_status_check;
ALTER TABLE public.press_ingest_candidates
  ADD CONSTRAINT press_ingest_candidates_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'skipped', 'failed', 'revoked'));

-- ─── welfare_programs ──────────────────────────────────────
ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── loan_programs ─────────────────────────────────────────
ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── RLS 갱신 (028 패턴) ─────────────────────────────────
DROP POLICY IF EXISTS "welfare_programs_read" ON public.welfare_programs;
CREATE POLICY "welfare_programs_read"
  ON public.welfare_programs FOR SELECT
  USING (is_hidden = false);

DROP POLICY IF EXISTS "loan_programs_read" ON public.loan_programs;
CREATE POLICY "loan_programs_read"
  ON public.loan_programs FOR SELECT
  USING (is_hidden = false);

-- ─── 인덱스 ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_welfare_auto_confirmed_at
  ON public.welfare_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_auto_confirmed_at
  ON public.loan_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_welfare_visible
  ON public.welfare_programs(created_at DESC)
  WHERE is_hidden = false;

CREATE INDEX IF NOT EXISTS idx_loan_visible
  ON public.loan_programs(created_at DESC)
  WHERE is_hidden = false;

-- ─── 코멘트 ───────────────────────────────────────────────
COMMENT ON COLUMN public.press_ingest_candidates.confidence_tier IS
  'LLM 분류 신뢰도 (high/mid/low). high+mid 자동 confirm, low 만 pending 큐 보존. AUTO_CONFIRM_TIER_FLOOR env 로 toggle.';
COMMENT ON COLUMN public.welfare_programs.auto_confirm_tier IS
  '자동 등록된 정책의 LLM 신뢰도. NULL = 수동 등록 또는 legacy 자동 등록 (077 이전).';
COMMENT ON COLUMN public.welfare_programs.is_hidden IS
  'soft hide. RLS 가 USING(is_hidden=false) 라 사용자 노출 즉시 차단. service_role 우회.';
