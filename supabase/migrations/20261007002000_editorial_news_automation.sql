-- 원문·초안·보류 사유는 서버에서만 읽습니다. 공개 화면에는 통과한 글만 전달합니다.
create table public.editorial_news_publications (
  source_id text primary key,
  news_id uuid not null references public.news_posts(id),
  status text not null check (status in ('processing', 'published', 'held')),
  lease_token uuid not null default gen_random_uuid(),
  article jsonb,
  source_hash text,
  evidence jsonb,
  reason text,
  attempted_at timestamptz not null default now(),
  published_at timestamptz,
  next_retry_at timestamptz not null default now()
);
alter table public.editorial_news_publications enable row level security;
revoke all on public.editorial_news_publications from public, anon, authenticated;
grant select, insert, update on public.editorial_news_publications to service_role;
create index editorial_news_published_idx on public.editorial_news_publications(published_at desc) where status = 'published';

-- 한국 시각 하루 3편, 하루 최대 6개 후보. 잠금으로 겹친 예약 작업도 한도를 지킵니다.
create function public.claim_editorial_news() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  candidate public.news_posts;
  token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('keepioo_editorial_daily_budget'));
  if (select count(*) from editorial_news_publications where
    (status = 'published' and published_at >= day_start) or
    (status = 'processing' and attempted_at > now() - interval '10 minutes')) >= 3
    or (select count(*) from editorial_news_publications where attempted_at >= day_start) >= 6 then return null; end if;
  select n.* into candidate from news_posts n
  left join editorial_news_publications p on p.source_id = n.source_id
  where n.source_id ~ '^\d{9}$' and n.source_id <> '148972815'
    and n.source_url ~ '^https://www\.korea\.kr/news/(policyNewsView|customizedNewsView)\.do\?newsId='
    and n.is_hidden = false and n.category = 'news'
    and n.published_at between now() - interval '7 days' and now()
    and length(n.body) >= 700
    and (p.source_id is null or (p.status = 'held' and p.next_retry_at <= now())
      or (p.status = 'processing' and p.attempted_at < now() - interval '10 minutes'))
  order by n.published_at desc, n.id limit 1;
  if candidate.id is null then return null; end if;
  insert into editorial_news_publications(source_id, news_id, status, lease_token)
    values(candidate.source_id, candidate.id, 'processing', token)
  on conflict(source_id) do update set status = 'processing', lease_token = token,
    attempted_at = now(), news_id = candidate.id, reason = null;
  return to_jsonb(candidate) || jsonb_build_object('lease_token', token);
end $$;
revoke all on function public.claim_editorial_news() from public, anon, authenticated;
grant execute on function public.claim_editorial_news() to service_role;

-- 예약한 자료가 변경되거나 비공개로 바뀌면 공개하지 않습니다.
create function public.finish_editorial_news(p_source_id text, p_token uuid,
  p_article jsonb, p_hash text, p_evidence jsonb, p_reason text,
  p_title text, p_url text, p_updated_at timestamptz) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare changed integer;
begin
  perform pg_advisory_xact_lock(hashtext('keepioo_editorial_daily_budget'));
  update editorial_news_publications p set
    status = case when p_article is null then 'held' else 'published' end,
    article = p_article, source_hash = p_hash, evidence = p_evidence, reason = p_reason,
    published_at = case when p_article is null then null else now() end,
    next_retry_at = now() + interval '1 day'
  where p.source_id = p_source_id and p.lease_token = p_token and p.status = 'processing'
    and p.attempted_at > now() - interval '10 minutes'
    and (p_article is null or exists(select 1 from news_posts n where n.id = p.news_id
      and n.source_id = p_source_id and n.is_hidden = false and n.title = p_title
      and n.source_url = p_url and n.updated_at is not distinct from p_updated_at));
  get diagnostics changed = row_count;
  return changed = 1;
end $$;
revoke all on function public.finish_editorial_news(text,uuid,jsonb,text,jsonb,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.finish_editorial_news(text,uuid,jsonb,text,jsonb,text,text,text,timestamptz) to service_role;
