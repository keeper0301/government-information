-- 본문은 저장소에서 검색하고 한 화면의 카드만 반환합니다. 숨긴 원문과 보류 글은 항상 제외합니다.
create or replace function public.editorial_news_reader_status(a jsonb, today date default (now() at time zone 'Asia/Seoul')::date)
returns text language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare t text := coalesce(a->>'title', ''); s date; e date;
begin
  if length(coalesce(a#>>'{schedule,evidence}', '')) > 0
    and a#>>'{schedule,start}' ~ '^\d{4}-\d{2}-\d{2}$' and a#>>'{schedule,end}' ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      s := (a#>>'{schedule,start}')::date; e := (a#>>'{schedule,end}')::date;
      if s <= e then
        return case when today < s then 'planned' when today > e then 'ended' else 'ongoing' end;
      end if;
    exception when datetime_field_overflow or invalid_datetime_format then null;
    end;
  end if;
  if t ~ '종료|접수 마감|행사 마감' then
    return case when t ~ '예정|추진|계획|검토|온라인.*\d+월\s*\d+일\s*까지' then 'mixed' else 'ended' end;
  end if;
  if t ~ '예정|추진|계획|검토' then return 'planned'; end if;
  return 'information';
end $$;

create or replace function public.search_editorial_news(
  p_q text default '', p_benefit text default '', p_province text default '', p_status text default '',
  p_page integer default 1, p_static_count integer default 0
) returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with visible as materialized (
    select p.source_id, p.published_at, p.article,
      lower(concat_ws(' ', p.article->>'title', p.article->>'question', p.article->>'answer',
        p.article->>'audience', p.article->>'sourceAgency',
        (select string_agg(concat_ws(' ', section->>'heading',
          (select string_agg(value, ' ') from jsonb_array_elements_text(section->'paragraphs'))), ' ')
         from jsonb_array_elements(p.article->'sections') section))) as search_text
    from editorial_news_publications p join news_posts n on n.id = p.news_id
    where p.status = 'published' and n.is_hidden = false
      and p.article->>'slug' ~ '^policy-brief-\d{9}$' and jsonb_typeof(p.article->'automaticPublication') = 'object'
  ), scoped as materialized (
    select * from visible v where
      (coalesce(p_province, '') = '' or v.article#>'{classification,regions}' ? p_province)
      and (coalesce(p_status, '') = '' or editorial_news_reader_status(v.article) = p_status)
      and not exists (select 1 from regexp_split_to_table(lower(left(trim(coalesce(p_q, '')), 200)), '\s+') term
        where term <> '' and position(term in v.search_text) = 0)
  ), matched as materialized (
    select * from scoped where coalesce(p_benefit, '') = '' or article#>'{classification,benefits}' ? p_benefit
  ), totals as (
    select count(*)::integer as count from matched
  ), paging as (
    select greatest(1, least(greatest(1, coalesce(p_page, 1)),
      ceil((count + greatest(0, least(coalesce(p_static_count, 0), 1000))) / 12.0)::integer)) as page from totals
  ), cards as (
    select article - 'sections' || '{"sections":[]}'::jsonb as article, published_at, source_id from matched
    order by published_at desc, source_id limit 12 offset (select (page - 1) * 12 from paging)
  ), benefits as (
    select tag, count(*) as count from scoped, lateral jsonb_array_elements_text(article#>'{classification,benefits}') tag group by tag
  )
  select jsonb_build_object(
    'articles', coalesce((select jsonb_agg(article order by published_at desc, source_id) from cards), '[]'::jsonb),
    'total', (select count from totals), 'allCount', (select count(*) from visible),
    'page', (select page from paging),
    'counts', coalesce((select jsonb_object_agg(tag, count) from benefits), '{}'::jsonb));
$$;
revoke all on function public.editorial_news_reader_status(jsonb, date) from public, anon, authenticated;
revoke all on function public.search_editorial_news(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.editorial_news_reader_status(jsonb, date) to service_role;
grant execute on function public.search_editorial_news(text, text, text, text, integer, integer) to service_role;
