-- ============================================================
-- 059: SECURITY DEFINER 함수 anon/authenticated 노출 정리
-- ============================================================
-- 발견 (2026-04-27 사이트 전체 헬스체크):
--   Supabase advisor security WARN 7건 신규 (lint 0028, 0029 신규 rule).
--   anon/authenticated 가 4 SECURITY DEFINER 함수 호출 가능 → 1건 진짜 P1.
--
-- 분석:
--   1) increment_ai_usage(user_id, date) — 🔴 P1
--      · 호출처: lib/quota.ts (createAdminClient = service_role 만)
--      · 위험: anon 노출 → 임의 user_id 로 호출 시 다른 사용자 AI quota 소진 (DoS)
--      · 수정: anon, authenticated REVOKE — service_role 만 호출 가능
--
--   2) get_program_counts() — 🟢
--      · 호출처: lib/home-stats.ts (anon)
--      · 테이블 RLS: welfare/loan qual=true, news qual=is_hidden=false
--      · 수정: SECURITY INVOKER 전환 — caller 권한 사용. news hidden 자동 제외 (의미상 정확)
--
--   3) get_welfare_region_counts() — 🟢
--      · 호출처: lib/home-stats.ts (anon)
--      · welfare_programs qual=true → SECURITY INVOKER 결과 동일
--      · 수정: SECURITY INVOKER 전환
--
--   4) increment_view_count(table, row_id) — 🟡 유지
--      · 호출처: welfare/loan/news 상세 페이지 (anon + authenticated)
--      · anon 의 view_count UPDATE 권한이 정책상 의도. INVOKER 전환 시
--        anon UPDATE 정책 신설 필요 → 위험 ↑. 의도된 SECURITY DEFINER 보존.
--
-- 효과:
--   advisor security WARN 7 → 3 (leaked_password 1 + increment_view_count × 2 role)
--   진짜 위험 0건 (남은 3건은 모두 의도되거나 사장님 외부 액션).
--
-- 회귀 위험 0:
--   1) increment_ai_usage — admin client (service_role) 만 호출 → REVOKE 무영향
--   2,3) get_*_counts — 테이블 RLS public SELECT 라 anon caller 권한 충분
--
-- 롤백:
--   GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, date) TO anon, authenticated;
--   ALTER FUNCTION public.get_program_counts() SECURITY DEFINER;
--   ALTER FUNCTION public.get_welfare_region_counts() SECURITY DEFINER;
-- ============================================================

-- 1) increment_ai_usage anon/authenticated REVOKE (P1 DoS 차단)
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, date) FROM anon, authenticated;

-- 2) get_program_counts SECURITY INVOKER 전환
ALTER FUNCTION public.get_program_counts() SECURITY INVOKER;

-- 3) get_welfare_region_counts SECURITY INVOKER 전환
ALTER FUNCTION public.get_welfare_region_counts() SECURITY INVOKER;
