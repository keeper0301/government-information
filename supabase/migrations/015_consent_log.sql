-- ============================================================
-- 015: 동의 기록 (consent_log)
-- ============================================================
-- 사용자가 개인정보처리방침·서비스 약관·마케팅 수신 등에 동의한 시점·버전을 기록.
-- Codex 외부 리뷰 지적 #4: 민감 토픽 동의는 시점·버전·철회·삭제 정책까지 데이터 모델로.
-- 카카오 비즈 앱 전환 (이메일 수집) 직후 출시 전 필수 보강.
--
-- 핵심 설계:
--   - 동의 시점의 방침 풀텍스트 snapshot 저장 (방침 개정 후에도 당시 동의 입증 가능)
--   - 같은 (user, type) 의 마지막 동의만 유효 — 새 row 생성으로 갱신
--   - 철회는 withdrawn_at 만 채움 (row 삭제 X — 감사 추적)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 동의 종류
  --   privacy_policy : 개인정보처리방침
  --   terms          : 서비스 이용약관
  --   marketing      : 마케팅 수신
  --   sensitive_topic: 민감 관심분야 저장 (저소득·임신·실직 등 향후 추가)
  --   kakao_messaging: 카카오 알림톡 수신
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'privacy_policy', 'terms', 'marketing', 'sensitive_topic', 'kakao_messaging'
  )),

  -- 방침/약관 버전 (예: '2026-04-24'). 버전 바뀌면 재동의 필요.
  version TEXT NOT NULL,

  -- 동의 시점의 방침 풀텍스트 snapshot.
  -- 방침이 나중에 바뀌어도 당시 사용자가 본 내용 입증 가능.
  full_text TEXT,

  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,

  -- 감사용 메타 (필수 아님)
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consent_log IS
  '사용자 동의 이력 (방침·약관·마케팅·민감토픽·카톡). 같은 (user,type) 의 마지막 행이 유효.';

-- ━━━ 인덱스 ━━━
-- 사용자별 최신 동의 조회 (가장 흔한 쿼리)
CREATE INDEX IF NOT EXISTS idx_consent_user_type_latest
  ON public.consent_log(user_id, consent_type, consented_at DESC);

-- 버전별 동의 통계 (개정 시 누가 재동의 필요한지 파악)
CREATE INDEX IF NOT EXISTS idx_consent_type_version
  ON public.consent_log(consent_type, version);

-- ━━━ RLS ━━━
-- 본인 동의 이력은 조회 가능. 쓰기는 service_role 만 (서버에서 헬퍼로).
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_self_select ON public.consent_log;
CREATE POLICY consent_self_select ON public.consent_log
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ━━━ 가장 최신 동의 조회용 view ━━━
-- 사용자 × 동의종류별 최신 동의 1행. lib/consent.ts 의 hasConsented 가 사용.
CREATE OR REPLACE VIEW public.user_latest_consent AS
SELECT DISTINCT ON (user_id, consent_type)
  user_id,
  consent_type,
  version,
  consented_at,
  withdrawn_at,
  (withdrawn_at IS NULL) AS is_active
FROM public.consent_log
ORDER BY user_id, consent_type, consented_at DESC;

COMMENT ON VIEW public.user_latest_consent IS
  '사용자별 동의 종류 마지막 행. is_active = 철회 안 된 동의.';
