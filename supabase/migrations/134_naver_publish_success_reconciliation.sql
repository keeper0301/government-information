-- Atomic, idempotent repair for a publish whose browser callback was lost.
-- Public title/body/UTM verification happens in the authenticated server helper
-- before this function is called. This function only closes the exact DB identity.
ALTER TABLE public.naver_publish_audit
  ADD COLUMN IF NOT EXISTS content_fingerprint text
  CHECK (content_fingerprint IS NULL OR content_fingerprint ~ '^[0-9a-f]{16}$');

COMMENT ON COLUMN public.naver_publish_audit.content_fingerprint IS
  'Exact rendered payload fingerprint at successful publication. Historical measurement stays pinned here across later formatter releases.';

CREATE OR REPLACE FUNCTION public.reconcile_naver_publish_success(
  p_queue_id uuid,
  p_content_id uuid,
  p_naver_url text,
  p_log_no text,
  p_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.naver_blog_queue%ROWTYPE;
  v_success_count integer;
  v_existing_url text;
  v_inserted boolean := false;
BEGIN
  IF p_log_no !~ '^\d{9,}$' OR p_fingerprint !~ '^[0-9a-f]{16}$' THEN
    RAISE EXCEPTION 'invalid reconciliation identity';
  END IF;
  IF p_naver_url !~ ('^https://m\.blog\.naver\.com/[A-Za-z0-9_-]+/' || p_log_no || '/?$') THEN
    RAISE EXCEPTION 'naver URL/logNo mismatch';
  END IF;

  SELECT * INTO v_queue
  FROM public.naver_blog_queue
  WHERE id = p_queue_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconcile queue not found'; END IF;
  IF v_queue.blog_post_id <> p_content_id THEN RAISE EXCEPTION 'content queue mismatch'; END IF;

  SELECT count(*), min(naver_url)
    INTO v_success_count, v_existing_url
  FROM public.naver_publish_audit
  WHERE post_id = p_content_id AND result = 'success';

  IF v_success_count > 1 THEN RAISE EXCEPTION 'duplicate success audit requires manual repair'; END IF;
  IF v_success_count = 1 AND (v_existing_url IS NULL OR v_existing_url !~ ('/' || p_log_no || '/?$')) THEN
    RAISE EXCEPTION 'existing success points to different post';
  END IF;

  IF v_success_count = 0 THEN
    INSERT INTO public.naver_publish_audit (
      post_id, result, naver_url, error_message, skip_reason, kst_hour, details, content_fingerprint
    ) VALUES (
      p_content_id,
      'success',
      p_naver_url,
      NULL,
      NULL,
      extract(hour from (now() AT TIME ZONE 'Asia/Seoul'))::smallint,
      jsonb_build_object(
        'runner', 'server-reconciliation',
        'stage', 'edit_public_readback_reconciled',
        'queueId', p_queue_id,
        'contentFingerprint', p_fingerprint,
        'logNo', p_log_no
      ),
      p_fingerprint
    );
    v_inserted := true;
  ELSE
    UPDATE public.naver_publish_audit
    SET content_fingerprint = p_fingerprint,
        details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
          'reconciledStage', 'edit_public_readback_reconciled',
          'contentFingerprint', p_fingerprint,
          'logNo', p_log_no
        )
    WHERE post_id = p_content_id
      AND result = 'success'
      AND content_fingerprint IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.naver_publish_audit
      WHERE post_id = p_content_id AND result = 'success'
        AND content_fingerprint IS DISTINCT FROM p_fingerprint
    ) THEN
      RAISE EXCEPTION 'successful audit fingerprint conflict';
    END IF;
  END IF;

  UPDATE public.naver_blog_queue
  SET status = 'published',
      published_at = COALESCE(published_at, now()),
      naver_url = p_naver_url,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_queue_id;

  RETURN jsonb_build_object('inserted', v_inserted, 'successCount', 1, 'queueId', p_queue_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_naver_publish_success(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_naver_publish_success(uuid, uuid, text, text, text) TO service_role;
