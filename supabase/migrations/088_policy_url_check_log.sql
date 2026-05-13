-- ============================================================
-- 088_policy_url_check_log — 정책 source URL 404 자동 감지 로그
-- ============================================================
-- 2026-05-14 신규. /api/cron/policy-url-check 매주 1회 cron 이
-- welfare_programs · loan_programs 의 apply_url 50건씩 HEAD 검증.
-- 404·5xx·timeout 발견 시 사장님 텔레그램 알림 → 정책 데이터 신뢰 안전망.
--
-- 정책:
-- - 매 row insert (history). 같은 program 가 여러 row 가질 수 있음
-- - is_dead=true 카운트로 추세 분석 가능
-- - 14일 이상 된 row 는 별도 정리 cron 으로 archive
-- ============================================================

CREATE TABLE IF NOT EXISTS policy_url_check_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id TEXT NOT NULL,
    program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan')),
    apply_url TEXT NOT NULL,
    status_code INT,
    is_dead BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 조회 최적화 — 최근 dead 검색·program 별 history
CREATE INDEX IF NOT EXISTS idx_policy_url_check_log_dead_recent
    ON policy_url_check_log (checked_at DESC)
    WHERE is_dead = TRUE;

CREATE INDEX IF NOT EXISTS idx_policy_url_check_log_program
    ON policy_url_check_log (program_type, program_id, checked_at DESC);

-- RLS — admin 만 read. cron 은 service_role 이라 bypass.
ALTER TABLE policy_url_check_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_only" ON policy_url_check_log
    FOR SELECT USING (false);  -- 일반 사용자 차단. service_role bypass.

COMMENT ON TABLE policy_url_check_log IS
    '정책 apply_url HEAD 검증 결과 history. /api/cron/policy-url-check 가 weekly insert.';
