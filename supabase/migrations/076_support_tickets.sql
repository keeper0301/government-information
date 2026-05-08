-- 076: 사용자 CS 1차 응대 큐 (Phase 4 자율 운영)
--
-- 사용자 문의·환불·계정 복구·버그·기능 요청을 일원 큐에 모음.
-- 1차 분류 (Claude Haiku) 로 intent 자동 식별 → 정해진 답변 또는 사장님 큐.
-- 사장님 /admin/support 에서 답변 작성 → 사용자 이메일 발송.
--
-- 운영 흐름:
--   1. 사용자가 chatbot-panel 또는 /support 페이지에서 문의 제출
--   2. /api/support/submit 가 intent 분류 + support_tickets row insert
--   3. intent 가 자동 응답 가능 (refund_policy_question·account_recovery 등) 이면
--      즉시 응답 + status='auto_replied'
--   4. 그 외는 status='open' → 사장님 /admin/support 큐 → 답변 → status='replied'
--   5. SMS reminder cron 이 24h 무응답 row 발견 시 사장님 SMS 알림 (Phase 4-C)

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 작성자 — 익명 가능 (비로그인). user_id NULL 이면 email 필수.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email text,
  contact_phone text,

  -- 사용자 입력 원본
  subject text,
  message text NOT NULL,

  -- LLM 분류 결과 — DECISION_KINDS 와 비슷한 패턴.
  -- refund_request / refund_policy_question / account_recovery / account_delete /
  -- bug_report / feature_request / policy_question / pricing_question / other
  intent text NOT NULL,
  -- 분류 신뢰도 (0~1) — 0.7 미만이면 자동 응답 보류, 사장님 큐 직행
  intent_confidence numeric(3, 2),
  -- LLM 분류 근거 (문장 1~2줄)
  intent_reason text,

  -- 처리 상태 — open(사장님 검토 대기) / auto_replied(자동 응답) /
  -- replied(사장님 답변 완료) / closed(추가 답변 불필요)
  status text NOT NULL DEFAULT 'open',

  -- 자동 응답 본문 (auto_replied 일 때만)
  auto_response text,

  -- 사장님 답변 본문 + 답변자·시각
  reply text,
  replied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replied_at timestamptz,

  -- timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 사장님 SMS reminder 발송 추적 — 중복 발송 방지
  reminder_sent_at timestamptz
);

-- 사장님 큐 빠른 조회 — 미답변 + 신청 순
CREATE INDEX IF NOT EXISTS idx_support_tickets_open
  ON public.support_tickets (created_at DESC)
  WHERE status = 'open';

-- intent 별 통계용
CREATE INDEX IF NOT EXISTS idx_support_tickets_intent_created
  ON public.support_tickets (intent, created_at DESC);

-- updated_at 자동 갱신 trigger (070 패턴 재사용 가능하지만 단독 정의로 명시)
CREATE OR REPLACE FUNCTION public.support_tickets_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_set_updated_at();

-- RLS — 사용자는 자기 ticket 만 조회·작성. admin client 우회 (admin 페이지·cron).
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 본인 ticket 조회만 (자기 문의 추적용 — 향후 /support/my 페이지 가능)
CREATE POLICY "own_tickets_select" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT 는 admin client (server) 만 허용 — 사용자가 직접 PostgREST 로 insert 못 함.
-- /api/support/submit endpoint 가 admin client 로 처리 (rate limit·검증 동반).
-- → POLICY 미정의 = 모든 INSERT 차단 (RLS 활성화 시 default deny).

COMMENT ON TABLE public.support_tickets IS
  '사용자 CS 1차 응대 큐 — intent 자동 분류 + 사장님 답변 추적. RLS: 본인 SELECT 만 (INSERT/UPDATE 는 admin client).';
