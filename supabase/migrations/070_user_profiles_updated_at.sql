-- 070: user_profiles.updated_at for signup funnel health
-- Tracks real profile save/update activity separately from the empty profile row
-- that can be created during auth callback.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.user_profiles
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.user_profiles.updated_at IS
  'Last profile update timestamp used by admin signup funnel health cards.';
