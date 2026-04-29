-- ============================================================
-- 068_referrals.sql — Phase 5 A3 Referral 시스템
-- ============================================================
-- 목적: "친구 초대 1명당 referrer 에게 Pro 1주 무료 연장" 보상 흐름.
--
-- 컬럼 의미
--   referrer_id        — 추천한 사용자 (auth.users.id)
--   referred_id        — 추천받아 가입한 사용자. UNIQUE → 한 사용자는
--                         생애 동안 단 1명의 referrer 만 가질 수 있음.
--                         발급(미사용) 단계에서는 NULL 이라 redeem 시점에
--                         UPDATE 하면서 채워짐.
--   code               — 6자리 base32 추천 코드 (referrer 별 1개 발급/재사용)
--   status             — pending(코드 발급, 미사용) / completed(redeem + 보상 완료)
--                         / rejected(자기추천·cap 초과 등 차단)
--   reward_applied_at  — Pro 1주 연장이 subscriptions 테이블에 적용된 시각.
--                         status='completed' 면 NOT NULL.
--
-- 보상 정책: 가입 1명당 referrer 의 subscriptions.current_period_end 를 7일 연장
-- 기존 행이 있으면 +7일, 없으면 tier='pro' status='trialing' 으로 신규 생성.
-- 자기 자신 추천 차단: DB CHECK + lib/referrals.ts 가드 이중 안전망.
-- 어뷰징 차단: 1 referrer 당 최대 10명 (lib 레벨 cap).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- redeem 전에는 NULL. redeem 시 UNIQUE 가 발동하므로 한 사용자는 단 1번만 redeem.
  referred_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'rejected')),
  reward_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 자기 자신 추천 금지 (DB 레벨 안전망)
  CONSTRAINT no_self_referral CHECK (
    referred_id IS NULL OR referrer_id <> referred_id
  )
);

COMMENT ON TABLE public.referrals IS
  'Phase 5 A3 추천 시스템. referrer 1명당 가입 1명마다 Pro 1주 보상.';

-- 한 referrer 가 발급받은 미사용 코드는 단 1개 (재발급 요청 시 같은 코드 재사용)
-- 부분 인덱스 — referred_id IS NULL (= 미사용 = pending) 행에만 적용.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referrer_pending_idx
  ON public.referrals (referrer_id) WHERE referred_id IS NULL;

-- 가입 callback 의 코드 lookup 인덱스 (미사용 코드만 필요)
CREATE INDEX IF NOT EXISTS referrals_code_pending_idx
  ON public.referrals (code) WHERE referred_id IS NULL;

-- 마이페이지 통계 query (referrer 별 status 카운트)
CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx
  ON public.referrals (referrer_id, status);

-- ============================================================
-- RLS — 본인 referrals 만 조회 가능. INSERT/UPDATE 는 service_role 만.
-- (anon/authenticated 의 INSERT 차단 → 임의 코드 생성·자기 보상 어뷰징 방지)
-- ============================================================
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- referrer 는 자기 발급 코드와 추천 통계 조회 가능
-- referred 는 자신이 redeem 된 행 1개 조회 가능 (단순 확인용)
CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = referrer_id
    OR (SELECT auth.uid()) = referred_id
  );

-- INSERT/UPDATE/DELETE 정책 미정의 → anon/authenticated 자동 차단.
-- service_role (admin client) 만 데이터 변경 가능.
