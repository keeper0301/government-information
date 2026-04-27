-- ============================================================
-- 062: update_policy_guides_timestamp 함수 search_path 고정
-- ============================================================
-- 배경:
--   d13453c (정책 가이드 페이지) 추가 시 policy_guides 테이블 + trigger 함수
--   update_policy_guides_timestamp 가 같이 들어왔는데, 보안 마이그레이션 059
--   (SECURITY DEFINER anon 노출 정리) 이후라 search_path 고정 미적용.
--
--   advisor WARN: function_search_path_mutable
--   → search_path injection 이론적 위험 (예: 공격자가 검색 경로에 악성 schema 주입).
--
-- 변경:
--   ALTER FUNCTION ... SET search_path = ''
--   - 빈 문자열 = 어떤 schema 도 자동 검색 안 함, 함수 본문은 schema-qualified
--     호출만 사용 (`new.updated_at = now()` — pg_catalog.now() 자동 매핑)
--   - 단순 trigger 함수라 schema 의존 0, 빈 search_path 안전
--
-- 효과:
--   - advisor WARN -1 (4 → 3, leaked_password_protection 외 의도된 것 잔존)
--   - 데이터 영향 0, RLS·인덱스 영향 0
--   - reversible (ALTER FUNCTION ... RESET search_path)
-- ============================================================

ALTER FUNCTION public.update_policy_guides_timestamp()
  SET search_path = '';
