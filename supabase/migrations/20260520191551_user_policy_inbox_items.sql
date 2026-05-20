-- ============================================================
-- user_policy_inbox_items
-- ============================================================
-- Personal policy inbox state for /mypage/notifications/history.
--
-- This table stores only per-user UI state:
--   - read_at: user has opened/marked the policy as read
--   - saved_at: user saved the policy inside the inbox
--   - hidden_at: user hid the policy from the default inbox view
--
-- It intentionally does not duplicate policy bodies or delivery rows.
-- 정책 본문은 welfare_programs / loan_programs 를 계속 source of truth 로 사용.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_policy_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan')),
  program_id UUID NOT NULL,
  read_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, program_type, program_id)
);

CREATE INDEX IF NOT EXISTS user_policy_inbox_items_user_updated_idx
  ON public.user_policy_inbox_items (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_policy_inbox_items_user_saved_idx
  ON public.user_policy_inbox_items (user_id, saved_at DESC)
  WHERE saved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_policy_inbox_items_program_idx
  ON public.user_policy_inbox_items (program_type, program_id);

ALTER TABLE public.user_policy_inbox_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_policy_inbox_items TO authenticated;

DROP POLICY IF EXISTS user_policy_inbox_items_select_own
  ON public.user_policy_inbox_items;
CREATE POLICY user_policy_inbox_items_select_own
  ON public.user_policy_inbox_items
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_policy_inbox_items_insert_own
  ON public.user_policy_inbox_items;
CREATE POLICY user_policy_inbox_items_insert_own
  ON public.user_policy_inbox_items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_policy_inbox_items_update_own
  ON public.user_policy_inbox_items;
CREATE POLICY user_policy_inbox_items_update_own
  ON public.user_policy_inbox_items
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_policy_inbox_items_delete_own
  ON public.user_policy_inbox_items;
CREATE POLICY user_policy_inbox_items_delete_own
  ON public.user_policy_inbox_items
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_policy_inbox_items IS
  'Per-user read/save/hide state for the personal policy inbox. Does not duplicate policy content.';
COMMENT ON COLUMN public.user_policy_inbox_items.program_type IS
  'welfare or loan. Maps to welfare_programs / loan_programs detail pages.';
COMMENT ON COLUMN public.user_policy_inbox_items.read_at IS
  'Timestamp when the user marked/opened this policy as read.';
COMMENT ON COLUMN public.user_policy_inbox_items.saved_at IS
  'Timestamp when the user saved this policy in the personal inbox.';
COMMENT ON COLUMN public.user_policy_inbox_items.hidden_at IS
  'Timestamp when the user hid this policy from the default inbox view.';
