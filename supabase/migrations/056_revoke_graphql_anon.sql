-- 056_revoke_graphql_anon.sql
-- pg_graphql anon 차단 — security advisor pg_graphql_anon_table_exposed 21건 해소.
--
-- 배경:
-- Supabase 가 자동 설치하는 pg_graphql 익스텐션이 graphql_public 스키마를
-- 통해 /graphql/v1 endpoint 를 노출. anon 역할이 SELECT 권한 가진 21개
-- 테이블·뷰의 스키마(이름·컬럼·타입·관계) 가 introspection 으로 공개됨.
-- (welfare_programs · loan_programs · blog_posts · news_posts · admin_actions
--  · subscriptions · payment_history · consent_log · pending_deletions · 등)
--
-- 데이터 자체는 RLS 로 보호되지만 스키마 정보 자체가 공격면 정보 제공.
-- keepioo 는 PostgREST(supabase-js) 만 사용하고 GraphQL 호출 코드 0건 →
-- anon 의 GraphQL 접근 차단으로 회귀 0 으로 21건 해소.
--
-- 옵션 A(DROP EXTENSION) 보다 옵션 B(REVOKE USAGE) 선택:
-- 익스텐션은 살리고 anon 만 차단. authenticated/service_role 은 영향 없음.
-- 미래 GraphQL 도입 가능성 보존. 롤백 단순.
--
-- 롤백:
--   GRANT USAGE ON SCHEMA graphql_public TO anon;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql_public TO anon;

-- anon 의 graphql_public 스키마 USAGE 권한 회수.
-- USAGE 없으면 schema 안의 객체 접근 자체 차단.
revoke usage on schema graphql_public from anon;

-- 기존에 정의된 모든 함수 (graphql.resolve 등) 의 EXECUTE 권한도 회수.
-- USAGE 차단만으로 충분하지만 이중 안전망.
revoke execute on all functions in schema graphql_public from anon;

-- 향후 신규 함수가 graphql_public 에 추가돼도 자동으로 anon EXECUTE 권한 부여 안 됨.
-- pg_graphql 익스텐션 업데이트 시 자동 권한 부여 차단.
alter default privileges in schema graphql_public revoke execute on functions from anon;
