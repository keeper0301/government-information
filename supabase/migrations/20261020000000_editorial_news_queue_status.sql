-- 예약하거나 한도를 소비하지 않고 현재 후보 상태만 읽습니다.
create or replace function public.editorial_news_queue_status() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
with budget as (
  select
    count(*) filter (where status = 'published' and published_at >=
      date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') as published,
    count(*) filter (where status = 'processing' and attempted_at > now() - interval '10 minutes') as processing,
    count(*) filter (where attempted_at >=
      date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
      and reason is distinct from 'configuration_unavailable') as attempted
  from editorial_news_publications
), candidates as (
  select p.status, p.next_retry_at, p.attempted_at,
    p.source_id is null or p.status = 'held' and p.next_retry_at <= now()
      or p.status = 'processing' and p.attempted_at < now() - interval '10 minutes' as ready
  from news_posts n left join editorial_news_publications p on p.source_id = n.source_id
  where n.source_id ~ '^\d{9}$' and n.source_id <> '148972815'
    and n.source_url ~ '^https://www\.korea\.kr/news/(policyNewsView|customizedNewsView)\.do\?newsId='
    and n.is_hidden = false and n.category = 'news'
    and n.published_at between now() - interval '7 days' and now() and length(n.body) >= 700
), counts as (
  select count(*) filter (where ready and (b.attempted < 6 or attempted_at >=
    date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) as eligible,
    count(*) filter (where ready) as ready,
    count(*) filter (where status = 'held' and next_retry_at > now()) as waiting
  from candidates cross join budget b
)
select jsonb_build_object('checkedAt', now(), 'published', b.published, 'processing', b.processing,
  'attempted', b.attempted, 'eligible', c.eligible, 'waiting', c.waiting,
  'reason', case
    when b.published >= 3 then 'daily_limit'
    when b.published + b.processing >= 3 then 'processing'
    when c.eligible > 0 then 'ready'
    when c.ready > 0 and b.attempted >= 6 then 'attempt_limit'
    when b.processing > 0 then 'processing'
    when c.waiting > 0 then 'retry_wait'
    else 'no_candidates' end)
from budget b cross join counts c;
$$;
revoke all on function public.editorial_news_queue_status() from public, anon, authenticated;
grant execute on function public.editorial_news_queue_status() to service_role;

-- 기존 예약과 동일한 잠금 안에서 멈춘 이유를 결정합니다. 기존 호출자는 그대로 유지합니다.
create or replace function public.claim_editorial_news_with_status() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare candidate jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('keepioo_editorial_daily_budget'));
  candidate := claim_editorial_news();
  if candidate is not null then return candidate; end if;
  return jsonb_build_object('stopReason', editorial_news_queue_status()->>'reason');
end $$;
revoke all on function public.claim_editorial_news_with_status() from public, anon, authenticated;
grant execute on function public.claim_editorial_news_with_status() to service_role;

-- 기사 없는 실행도 남깁니다. 원문·초안·인증 정보는 저장하지 않습니다.
create table public.editorial_news_runs (
  id bigint generated always as identity primary key,
  finished_at timestamptz not null default now(),
  result jsonb not null
);
alter table public.editorial_news_runs enable row level security;
revoke all on public.editorial_news_runs from public, anon, authenticated;
grant select, insert on public.editorial_news_runs to service_role;
grant usage on sequence public.editorial_news_runs_id_seq to service_role;
create index editorial_news_runs_finished_idx on public.editorial_news_runs(finished_at desc);
