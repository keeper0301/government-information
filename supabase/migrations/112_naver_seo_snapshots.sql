-- ============================================================
-- 112_naver_seo_snapshots — 네이버 서치어드바이저 주차별 스냅샷
-- ============================================================
-- 서치어드바이저는 공식 API 가 없어 Playwright(tools/naver-seo/collect.mjs)로
-- 주1회 수집한 사이트진단·노출클릭 데이터를 여기 쌓는다. 주차별 비교로 색인·노출
-- 추세 분석 + 대응책 자동 생성(텔레그램 리포트). admin 데이터라 service_role 전용.
-- ============================================================

create table if not exists naver_seo_snapshots (
  id uuid primary key default gen_random_uuid(),
  collected_at timestamptz not null default now(),

  -- 사이트 진단
  indexed_count int,        -- 색인된 페이지 수
  index_excluded int,       -- 색인제외 (noindex 등)
  crawl_limited int,        -- 수집제한 (접근 불가)
  seo_issues jsonb,         -- 진단 이슈별 건수 {"h1_dup":1858,"title_dup":21,"desc_dup":32,...}
  diagnosis_updated date,   -- 진단 데이터 기준일 (네이버 "최근 업데이트")

  -- 노출/클릭 (최근 30일)
  total_impressions int,    -- 총 노출
  total_clicks int,         -- 총 클릭
  avg_ctr numeric,          -- 평균 CTR (%)
  top_keywords jsonb,       -- [{"label":검색어,"click":N,"impression":N,"ctr":N}]
  top_pages jsonb,          -- [{"label":URL,"click":N,"impression":N,"ctr":N}]
  expose_updated date,      -- 노출 데이터 기준일

  raw jsonb                 -- 수집 원본 전체 (디버깅/추가분석용)
);

-- 최신 스냅샷 + 주차 비교 조회용
create index if not exists idx_naver_seo_snapshots_collected
  on naver_seo_snapshots (collected_at desc);

-- admin 전용 — RLS 켜고 policy 없음 = anon/authenticated 차단, service_role 만 접근.
alter table naver_seo_snapshots enable row level security;
