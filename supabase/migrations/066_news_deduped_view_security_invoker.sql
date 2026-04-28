-- ============================================================
-- 066_news_deduped_view_security_invoker.sql — view RLS 우회 차단 (Phase 5 보강)
-- ============================================================
-- code-reviewer agent (2026-04-28) 가 65 마이그레이션의 view 안전성 검토:
--   "WITH (security_invoker = true) 없음 → news_posts 에 RLS 강화 시 view 우회"
--
-- Postgres view 의 default 는 security_definer (view 소유자 권한). RLS 가
-- 향후 강화돼도 view 통과하면 모든 row 노출 가능. 056·059 의 anon 권한 강화
-- 흐름과 충돌 잠재.
--
-- security_invoker = true → view 호출자(anon/authenticated) 권한으로 underlying
-- table 조회. RLS 가 정상 적용. Supabase advisor 의 security_definer_view 경고도
-- 차단.
-- ============================================================

ALTER VIEW public.news_posts_deduped SET (security_invoker = true);

COMMENT ON VIEW public.news_posts_deduped IS
  'cron INSERT 전 dedupe skip (lib/news-dedupe.ts) 의 안전망. 같은 dedupe_hash 중 가장 최근 published_at 1건만 노출. security_invoker=true 로 호출자 권한 RLS 적용 (066 보강).';
