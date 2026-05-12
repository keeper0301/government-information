-- 087: 네이버 블로그 RPA 자동 발행 — 세션 cookies 저장 + 발행 audit
--
-- Phase 2-B of docs/superpowers/specs/2026-05-12-naver-blog-rpa-design.md
--
-- 핵심:
--   1) naver_session_cookies — Playwright cookies (사장님 Chrome 에서 export)
--      vault. 만료 임박 시 health-alert cron 이 알림.
--   2) naver_publish_audit — 매 발행 시도마다 row 1개. 일일 cap·rate limit
--      계산의 single source of truth (인스타 attempt_count 사고 교훈).
--   3) naver_blog_queue 확장 — attempt_count + last_error (인스타 패턴).
--
-- service_role 만 접근 — RLS 켜고 policy 0개 (anon/authenticated 차단).
-- service_role 은 default 로 RLS BYPASS.

-- ===========================================================================
-- 1) naver_session_cookies — Playwright session vault
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.naver_session_cookies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Playwright addCookies 형식 그대로
  -- [{ name, value, domain, path, expires, httpOnly, secure, sameSite }, ...]
  cookies jsonb NOT NULL,

  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 단일 active row 만 사용. 새 cookies 업로드 시 옛 row 의 active = false
  active boolean NOT NULL DEFAULT true,

  -- 가장 빨리 만료되는 cookie 의 expires (health-alert cron 의 임박 검사용)
  expires_min timestamptz,

  notes text  -- 사장님 메모 (선택)
);

CREATE INDEX IF NOT EXISTS idx_naver_session_cookies_active
  ON public.naver_session_cookies(active, uploaded_at DESC)
  WHERE active = true;

ALTER TABLE public.naver_session_cookies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.naver_session_cookies IS
  'service_role 전용. RLS 켜고 policy 0개. 사장님 Chrome 에서 export 한 네이버 세션 cookies.';

COMMENT ON COLUMN public.naver_session_cookies.cookies IS
  'Playwright BrowserContext.addCookies() 형식. domain/name/value/path/expires/httpOnly/secure/sameSite.';

COMMENT ON COLUMN public.naver_session_cookies.expires_min IS
  '12개 cookies 중 가장 빨리 만료되는 시점. health-alert cron 이 D-3 임박 시 사장님 텔레그램 알림.';

-- ===========================================================================
-- 2) naver_publish_audit — 매 발행 시도 logging
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.naver_publish_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 발행 시도한 blog_posts row (null 이면 dry-run 또는 skip)
  post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,

  attempted_at timestamptz NOT NULL DEFAULT now(),

  -- 'success' | 'fail' | 'skipped'
  result text NOT NULL
    CHECK (result IN ('success', 'fail', 'skipped')),

  -- fail 시 에러 메시지 (rate limit, captcha_detected, 2fa_detected, etc.)
  error_message text,

  -- success 시 발행된 네이버 글 URL (m.site.naver.com/... 단축 또는 blog.naver.com/...)
  naver_url text,

  -- skip 사유 — 'outside_hours' | 'daily_cap_reached' | 'no_cookies' | 'disabled' | 'captcha_detected' | '2fa_detected'
  skip_reason text,

  -- 시간대 보안 검증용 (audit 분석 시 KST 시간 패턴 확인)
  kst_hour smallint,

  -- 추가 디버깅 정보 (selector 변경 감지, polling 결과 등)
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_naver_publish_audit_attempted_at
  ON public.naver_publish_audit(attempted_at DESC);

-- 일일 cap query 빠르게: WHERE result='success' AND attempted_at >= today
CREATE INDEX IF NOT EXISTS idx_naver_publish_audit_success_recent
  ON public.naver_publish_audit(attempted_at DESC)
  WHERE result = 'success';

ALTER TABLE public.naver_publish_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.naver_publish_audit IS
  'service_role 전용. 매 cron 실행마다 row 1개. 일일 cap·rate limit·진단의 single source of truth.';

-- ===========================================================================
-- 3) naver_blog_queue 확장 — attempt_count + last_error (인스타 사고 교훈)
-- ===========================================================================
ALTER TABLE public.naver_blog_queue
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN public.naver_blog_queue.attempt_count IS
  '발행 시도 횟수. 3회 도달 시 cron 후보에서 제외 (인스타 패턴 동일).';

COMMENT ON COLUMN public.naver_blog_queue.last_error IS
  '가장 최근 발행 실패 에러 메시지 (디버깅용).';
