-- 075: SMS 양방향 결정 위임 (Phase 2 자율 운영)
--
-- 사장님 SMS 답장 (1=승인, 2=무시, 3=상의) 으로 임계 조정·승인 위임.
-- 발송된 결정 요청을 추적해 답장 도착 시 매칭 + 자동 액션 실행.
--
-- 운영 시나리오:
--   1. cron 또는 admin 액션이 registerDecision('dedupe_threshold_w2', ...)
--      → SMS 발송 + decision_pending row insert (decision=NULL, decided_at=NULL)
--   2. 사장님 휴대폰 답장 "1"
--   3. /api/webhook/solapi-receive 가 발신번호·내용 검증 후
--      가장 최근 미결정 row 의 decision='approve' 채움 + 액션 실행
--   4. 24h 미결정 row 는 expired 자동 처리 (cleanup cron)

CREATE TABLE IF NOT EXISTS public.decision_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 결정 종류 — DECISION_KINDS 와 1:1 매핑 (lib/sms/decision-router.ts)
  -- 예: 'dedupe_threshold_w2' / 'dedupe_threshold_w3' / 'spec_c_baseline_start'
  kind text NOT NULL,
  -- SMS 본문에 표시된 prompt — 추적용 (실제 매칭은 id 로 함)
  prompt text NOT NULL,
  -- 액션별 추가 컨텍스트 (예: { "from_threshold": 0.92, "to_threshold": 0.88 })
  context jsonb,
  -- 발송 시각·만료 시각 (24h)
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  -- 답장 결과: 'approve' | 'reject' | 'consult' | 'expired' | NULL (대기 중)
  decision text,
  decided_at timestamptz,
  -- 답장 발신번호 (사칭 추적용 — 화이트리스트 통과 후 저장)
  sender_phone text,
  -- 액션 실행 결과 (예: 'success' / 'error: ...')
  action_result text
);

-- 미결정 row 빠른 조회 (webhook 이 매번 사용)
CREATE INDEX IF NOT EXISTS idx_decision_pending_undecided
  ON public.decision_pending (sent_at DESC)
  WHERE decision IS NULL;

-- 만료 cleanup 빠른 조회
CREATE INDEX IF NOT EXISTS idx_decision_pending_expired
  ON public.decision_pending (expires_at)
  WHERE decision IS NULL;

COMMENT ON TABLE public.decision_pending IS
  'SMS 양방향 결정 위임 추적. 발송한 결정 요청·답장·액션 결과 영구 기록.';

COMMENT ON COLUMN public.decision_pending.kind IS
  'DECISION_KINDS (lib/sms/decision-router.ts) 매핑 키. 새 결정 종류 추가 시 같이.';
