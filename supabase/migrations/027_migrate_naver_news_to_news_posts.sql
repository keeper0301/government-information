-- ============================================================
-- 027 naver-news 수집분을 welfare/loan 에서 news_posts 로 이전
-- ============================================================
-- 배경: lib/news-collectors/naver-news.ts 가 2026-04-24 ~ 2026-04-25 사이
-- welfare_programs / loan_programs 에 23000+ 건의 네이버 뉴스를 저장. 이로 인해:
--   1) /welfare·/loan 목록에 '공고' 가 아닌 뉴스 기사가 혼입 (사용자 혼란)
--   2) /api/enrich cron 이 bokjiro/youthcenter 와 매칭 안 되는 뉴스 row
--      를 nullsFirst 로 먼저 뽑아 10건 전부 skipped → '모든 후보 skipped'
--      알림 반복 (2026-04-25 AM 7:57 수신)
--
-- 해결: naver-news collector 저장 대상을 news_posts 로 변경 (2026-04-25
-- master 커밋). 기존에 쌓인 welfare/loan 의 naver-news-* row 를 news_posts
-- 로 INSERT 한 후 원본 welfare/loan 에서 DELETE.
--
-- 안전 설계:
--   · INSERT ... ON CONFLICT (source_code, source_id) DO NOTHING
--     — 이미 news_posts 에 있는 건은 건드리지 않음 (중복 방지)
--   · slug 생성: title 한글 유지 + 특수문자 제거 + sourceId 부착 (deterministic)
--     korea.kr news_posts 와 동일한 규칙
--   · license = 'naver-news-api' — 공공누리 아님, 저작권은 원 언론사
--   · 이전 끝난 뒤에만 welfare/loan 에서 DELETE (Postgres 트랜잭션 자동 rollback
--     으로 모두 성공 또는 모두 실패)
-- ============================================================

begin;

-- ─── 1) welfare_programs 의 naver-news-* → news_posts ───
insert into news_posts (
  source_code, source_id, source_url, license, category, ministry,
  benefit_tags, title, summary, body, thumbnail_url, slug,
  published_at, created_at, updated_at, view_count, keywords, topic_categories
)
select
  source_code,
  source_id,
  source_url,
  'naver-news-api'                           as license,
  'news'                                     as category,
  coalesce(source, region, '전국')           as ministry,
  coalesce(benefit_tags, '{}'::text[])       as benefit_tags,
  title,
  description                                as summary,
  null                                       as body,
  null                                       as thumbnail_url,
  -- slug: title 소문자 + [^\w\s가-힣] 제거 + 공백 → '-' + 60자 제한 + '-<source_id>'
  left(
    regexp_replace(
      regexp_replace(
        lower(trim(title)),
        '[^[:alnum:][:space:]\-가-힣]', '', 'g'
      ),
      '\s+', '-', 'g'
    ),
    60
  ) || '-' || source_id                      as slug,
  published_at,
  coalesce(fetched_at, now())                as created_at,
  now()                                      as updated_at,
  coalesce(view_count, 0)                    as view_count,
  '{}'::text[]                               as keywords,
  '{}'::text[]                               as topic_categories
from welfare_programs
where source_code like 'naver-news-%'
on conflict (source_code, source_id) do nothing;

-- ─── 2) loan_programs 의 naver-news-* → news_posts ───
-- 현재 없지만 방어적으로 (향후 collector 가 이전 버전 환원 시 대비)
insert into news_posts (
  source_code, source_id, source_url, license, category, ministry,
  benefit_tags, title, summary, body, thumbnail_url, slug,
  published_at, created_at, updated_at, view_count, keywords, topic_categories
)
select
  source_code,
  source_id,
  source_url,
  'naver-news-api',
  'news',
  coalesce(source, region, '전국'),
  coalesce(benefit_tags, '{}'::text[]),
  title,
  description,
  null,
  null,
  left(
    regexp_replace(
      regexp_replace(
        lower(trim(title)),
        '[^[:alnum:][:space:]\-가-힣]', '', 'g'
      ),
      '\s+', '-', 'g'
    ),
    60
  ) || '-' || source_id,
  published_at,
  coalesce(fetched_at, now()),
  now(),
  coalesce(view_count, 0),
  '{}'::text[],
  '{}'::text[]
from loan_programs
where source_code like 'naver-news-%'
on conflict (source_code, source_id) do nothing;

-- ─── 3) 원본 welfare/loan 에서 naver-news-* row 삭제 ───
delete from welfare_programs where source_code like 'naver-news-%';
delete from loan_programs where source_code like 'naver-news-%';

commit;
