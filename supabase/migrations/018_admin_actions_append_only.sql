-- ============================================================
-- 017: admin_actions 감사 로그 append-only 보장
-- ============================================================
-- 016 마이그레이션에서 만든 admin_actions 는 RLS 로 클라이언트 접근은 차단했지만
-- service_role 은 UPDATE/DELETE 가능 → 엄밀한 감사 로그가 아니었음.
-- 이 마이그레이션은 DB 레벨 trigger 로 UPDATE/DELETE 를 원천 차단해 append-only 보장.
--
-- ⚠️ 주의: auth.users 가 삭제되면 FK ON DELETE SET NULL 로 actor_id/target_user_id 가
-- NULL 로 바뀌는 UPDATE 가 발동됨 → 단순 BEFORE UPDATE 차단 시 사용자 탈퇴 흐름 자체가
-- 전부 롤백됨 (감사 로그 보존이 사용자 삭제를 막는 역설).
--
-- 해결: UPDATE 트리거는 "content(id/action/details/created_at) 변경은 차단하되,
-- FK 컬럼의 NULL 화(cascade)만 허용" 조건부 차단.
-- DELETE 는 무조건 차단 — 감사 로그를 지울 정당한 경로가 없음.
--
-- 운영 중 수동으로 수정/삭제가 필요한 드문 경우엔 trigger 를 일시 DROP 후 재생성.
-- ============================================================

-- ━━━ UPDATE 차단: content 변경 시만 EXCEPTION, FK SET NULL 은 통과 ━━━
CREATE OR REPLACE FUNCTION public.prevent_admin_actions_content_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- id / action / details / created_at 은 절대 불변이어야 함.
  -- actor_id / target_user_id 는 원래 값 유지 또는 NULL 로 변경(=FK SET NULL)만 허용.
  IF NEW.id = OLD.id
    AND NEW.action = OLD.action
    AND NEW.details IS NOT DISTINCT FROM OLD.details
    AND NEW.created_at = OLD.created_at
    AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
    AND (NEW.target_user_id IS NULL OR NEW.target_user_id = OLD.target_user_id)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'admin_actions is append-only (FK SET NULL cascade only)';
END;
$$;

-- ━━━ DELETE 차단: 예외 없이 금지 ━━━
CREATE OR REPLACE FUNCTION public.prevent_admin_actions_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_actions is append-only (DELETE forbidden)';
END;
$$;

-- ━━━ 트리거 연결 (멱등성 위해 DROP IF EXISTS 선행) ━━━
DROP TRIGGER IF EXISTS admin_actions_prevent_update ON public.admin_actions;
CREATE TRIGGER admin_actions_prevent_update
BEFORE UPDATE ON public.admin_actions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_actions_content_change();

DROP TRIGGER IF EXISTS admin_actions_prevent_delete ON public.admin_actions;
CREATE TRIGGER admin_actions_prevent_delete
BEFORE DELETE ON public.admin_actions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_actions_delete();

-- ━━━ TRUNCATE 차단 ━━━
-- BEFORE DELETE 는 row-level 이라 TRUNCATE TABLE 에는 발동 안 함 → 우회 가능.
-- STATEMENT-level trigger 로 테이블 비우기 자체를 막음.
DROP TRIGGER IF EXISTS admin_actions_prevent_truncate ON public.admin_actions;
CREATE TRIGGER admin_actions_prevent_truncate
BEFORE TRUNCATE ON public.admin_actions
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_admin_actions_delete();

COMMENT ON FUNCTION public.prevent_admin_actions_content_change() IS
  'admin_actions 의 content 불변 보장. FK SET NULL cascade 만 예외 허용.';
COMMENT ON FUNCTION public.prevent_admin_actions_delete() IS
  'admin_actions 감사 로그 DELETE/TRUNCATE 전면 차단.';
