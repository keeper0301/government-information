-- 109 unindexed FK covering index — advisor performance INFO(unindexed_foreign_keys) 해소
-- ============================================================
-- FK 컬럼에 covering index 가 없으면 FK join·delete cascade·참조 무결성 검사 시 seq scan.
-- 대부분 admin/audit FK(revoked_by·confirmed_by 등, 저빈도)지만 index 는 cascade/join 성능 +
-- advisor 깨끗. 작은~중 테이블(최대 welfare 11K)이라 생성 lock 은 ms 단위 — cron 영향 미미.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_loan_programs_revoked_by ON public.loan_programs(revoked_by);
CREATE INDEX IF NOT EXISTS idx_welfare_programs_revoked_by ON public.welfare_programs(revoked_by);
CREATE INDEX IF NOT EXISTS idx_naver_blog_queue_published_by ON public.naver_blog_queue(published_by);
CREATE INDEX IF NOT EXISTS idx_naver_blog_queue_skipped_by ON public.naver_blog_queue(skipped_by);
CREATE INDEX IF NOT EXISTS idx_naver_publish_audit_post_id ON public.naver_publish_audit(post_id);
CREATE INDEX IF NOT EXISTS idx_naver_session_cookies_uploaded_by ON public.naver_session_cookies(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_press_ingest_candidates_confirmed_by ON public.press_ingest_candidates(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_press_ingest_candidates_rejected_by ON public.press_ingest_candidates(rejected_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_replied_by ON public.support_tickets(replied_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
