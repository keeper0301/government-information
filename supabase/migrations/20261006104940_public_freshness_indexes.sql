-- 하단 갱신 시각 조회에서 전체 자료를 훑지 않고 최신 한 건만 찾습니다.
-- 색인은 자료의 내용·접근 권한·수집 동작을 바꾸지 않습니다.
set lock_timeout = '3s';
set statement_timeout = '30s';
create index if not exists idx_news_created_at_desc on public.news_posts (created_at desc);
create index if not exists idx_welfare_created_at_desc on public.welfare_programs (created_at desc);
create index if not exists idx_loan_created_at_desc on public.loan_programs (created_at desc);
reset lock_timeout;
reset statement_timeout;
