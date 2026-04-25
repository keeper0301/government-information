-- ============================================================
-- 028: news_posts 콘텐츠 모더레이션 — is_hidden soft-hide 컬럼·RLS 게이팅
-- ============================================================
-- 배경:
--   korea.kr / naver-news 수집분 중 법적 요청·명예훼손 우려·오보가
--   접수된 단건을 admin 이 1~2 클릭으로 전체 사이트에서 즉시 비공개
--   전환할 수 있어야 함. 현재는 Supabase 대시보드에서 직접 SQL 을
--   쳐야 하는 상태라 대응 속도·실수 위험 모두 큼.
--
-- 설계 핵심:
--   1) is_hidden 단일 boolean 이 모든 노출 제어의 SoT (Source of Truth).
--   2) RLS SELECT 정책을 is_hidden=false 조건부로 교체 → /news 목록·홈
--      "최근 정책 소식"·sitemap·관련공고 매칭·키워드 페이지 등 모든
--      공개 쿼리에 자동 적용. 코드 누락 위험 0.
--   3) admin 운영 UI 는 service_role (createAdminClient) 로 RLS 우회.
--   4) hidden_at·hidden_by·hidden_reason 으로 감사 추적성 확보.
--
-- 자세한 스펙: docs/superpowers/specs/2026-04-25-news-moderation-design.md
-- ============================================================

begin;

-- ─── 1) 컬럼 4개 추가 ───
alter table public.news_posts
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid,
  add column if not exists hidden_reason text;

comment on column public.news_posts.is_hidden      is '메인 숨김 플래그. 모든 공개 쿼리는 RLS 로 false 만 본다.';
comment on column public.news_posts.hidden_at      is '숨긴 시각 (감사·정렬용)';
comment on column public.news_posts.hidden_by      is '숨긴 admin 의 auth.users.id';
comment on column public.news_posts.hidden_reason  is '사유 포맷: "{category}: {note}" 예: "저작권: 홍길동 요청 2026-04-25"';

-- ─── 2) 공개 목록 쿼리용 partial index ───
-- 대부분 행이 is_hidden=false 라 partial index 가 효율적. 일반 idx_news_published
-- 는 그대로 유지 (admin 화면이 hidden 포함 정렬할 때 활용).
create index if not exists idx_news_posts_visible
  on public.news_posts (published_at desc)
  where is_hidden = false;

-- ─── 3) RLS 정책 교체 — 핵심 ───
-- 기존 anon·authenticated 무조건 SELECT 허용을 is_hidden=false 조건부로 교체.
-- 이 한 줄이 /news 목록·홈·sitemap·키워드 페이지 모두에 자동 적용된다.
drop policy if exists news_posts_public_select on public.news_posts;
create policy news_posts_public_select on public.news_posts
  for select
  using (is_hidden = false);

commit;
