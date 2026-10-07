-- 새 후보는 하루 6개까지이며, 이미 검사한 같은 후보의 복구 재시도는 새 후보로 세지 않습니다.
create or replace function public.claim_editorial_news() returns jsonb
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
    then return null; end if;
  select n.* into candidate from news_posts n
  left join editorial_news_publications p on p.source_id = n.source_id
  where n.source_id ~ '^\d{9}$' and n.source_id <> '148972815'
    and n.source_url ~ '^https://www\.korea\.kr/news/(policyNewsView|customizedNewsView)\.do\?newsId='
    and n.is_hidden = false and n.category = 'news'
    and n.published_at between now() - interval '7 days' and now()
    and length(n.body) >= 700
    and (p.attempted_at >= day_start or (select count(*) from editorial_news_publications
      where attempted_at >= day_start and reason is distinct from 'configuration_unavailable') < 6)
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
