-- ============================================================
-- 115: SNS Control Tower 원장
-- ============================================================
-- Keepioo SNS 발행물을 파일 리포트가 아니라 DB 원장으로 관리한다.
-- 목적:
--   - 같은 콘텐츠의 최종본(active_final)과 이전본(superseded) 분리
--   - 삭제 실패/수동 삭제 대기 큐 추적
--   - 렌더러/manifest 기록으로 Playwright/Next ImageResponse 혼선 방지
--   - 토큰 권한 점검 결과 저장
--
-- Phase 2는 스키마만 추가한다. 기존 Hermes JSON/report 이관은 별도 action/script.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sns_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Keepioo 콘텐츠 묶음. 예: 20260510-소공인-판로개척지원사업-대상부터-확인
  group_key TEXT NOT NULL,
  item_id TEXT NOT NULL,
  topic TEXT NOT NULL,

  -- instagram | threads | naver_blog | wordpress 등 확장 가능
  platform TEXT NOT NULL,

  -- platform 식별자
  media_id TEXT,
  permalink TEXT,
  shortcode TEXT,

  -- active_final | superseded | delete_pending | delete_failed_permission | manually_deleted | archived
  status TEXT NOT NULL DEFAULT 'active_final',

  published_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.sns_posts(id) ON DELETE SET NULL,

  -- 발행/검증 리포트 추적
  source_report_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sns_posts_status_check CHECK (
    status IN (
      'active_final',
      'superseded',
      'delete_pending',
      'delete_failed_permission',
      'manually_deleted',
      'archived'
    )
  ),
  CONSTRAINT sns_posts_platform_check CHECK (platform <> ''),
  CONSTRAINT sns_posts_item_platform_unique UNIQUE (item_id, platform)
);

-- 한 플랫폼/콘텐츠 묶음에 최종본은 하나만 허용.
CREATE UNIQUE INDEX IF NOT EXISTS sns_posts_one_active_final_per_group
  ON public.sns_posts(group_key, platform)
  WHERE status = 'active_final';

CREATE INDEX IF NOT EXISTS sns_posts_recent
  ON public.sns_posts(platform, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS sns_posts_status_recent
  ON public.sns_posts(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sns_posts_group_recent
  ON public.sns_posts(group_key, platform, published_at DESC NULLS LAST);

COMMENT ON TABLE public.sns_posts IS
  'SNS 발행물 원장. 최종본/이전본/삭제대기/삭제실패 상태를 관리한다.';


CREATE TABLE IF NOT EXISTS public.sns_render_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sns_post_id UUID REFERENCES public.sns_posts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram',

  renderer TEXT NOT NULL,
  manifest_path TEXT,
  dimensions TEXT,
  asset_count INT NOT NULL DEFAULT 0,
  render_ok BOOLEAN,
  rendered_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sns_render_artifacts_renderer_check CHECK (renderer <> '')
);

CREATE INDEX IF NOT EXISTS sns_render_artifacts_item_recent
  ON public.sns_render_artifacts(item_id, created_at DESC);

COMMENT ON TABLE public.sns_render_artifacts IS
  'SNS 카드/이미지 렌더 산출물. 렌더러와 manifest를 저장해 디자인 혼선을 막는다.';


CREATE TABLE IF NOT EXISTS public.sns_cleanup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sns_post_id UUID REFERENCES public.sns_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  media_id TEXT,
  permalink TEXT,

  -- pending | retrying | failed_permission | failed_api | manually_deleted | skipped | done
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  last_error TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  source_report_path TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sns_cleanup_queue_status_check CHECK (
    status IN (
      'pending',
      'retrying',
      'failed_permission',
      'failed_api',
      'manually_deleted',
      'skipped',
      'done'
    )
  )
);

CREATE INDEX IF NOT EXISTS sns_cleanup_queue_status_recent
  ON public.sns_cleanup_queue(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sns_cleanup_queue_media
  ON public.sns_cleanup_queue(platform, media_id);

COMMENT ON TABLE public.sns_cleanup_queue IS
  '이전 SNS 발행본 삭제/정리 큐. API 삭제 실패와 수동 삭제 완료를 추적한다.';


CREATE TABLE IF NOT EXISTS public.sns_token_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  token_type TEXT,
  can_publish BOOLEAN,
  can_delete BOOLEAN,
  expires_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sns_token_health_checks_recent
  ON public.sns_token_health_checks(platform, checked_at DESC);

COMMENT ON TABLE public.sns_token_health_checks IS
  'SNS 토큰 권한/만료 점검 로그. 발행 가능과 삭제 가능을 분리한다.';

-- RLS: 운영 원장은 service_role 서버 코드에서만 접근한다.
ALTER TABLE public.sns_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_render_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_cleanup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_token_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sns_posts_block_anon ON public.sns_posts;
CREATE POLICY sns_posts_block_anon
  ON public.sns_posts
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS sns_render_artifacts_block_anon ON public.sns_render_artifacts;
CREATE POLICY sns_render_artifacts_block_anon
  ON public.sns_render_artifacts
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS sns_cleanup_queue_block_anon ON public.sns_cleanup_queue;
CREATE POLICY sns_cleanup_queue_block_anon
  ON public.sns_cleanup_queue
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS sns_token_health_checks_block_anon ON public.sns_token_health_checks;
CREATE POLICY sns_token_health_checks_block_anon
  ON public.sns_token_health_checks
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
