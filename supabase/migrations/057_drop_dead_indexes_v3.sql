-- 057_drop_dead_indexes_v3.sql
-- 진짜로 코드 사용처 0 인 dead index 2개 제거 — performance advisor 정리.
--
-- 분석 결과 advisor 가 보고한 5건 중 3건은 가짜 dead:
--   · idx_pending_deletions_scheduled — finalize-deletions cron 매일 사용
--   · idx_payment_user — /mypage/billing 사용자별 결제 history 조회
--   · idx_admin_actions_target_recent — /admin/users/[id] getTargetActions
--   → 데이터 적어 planner 가 sequential scan 사용 중일 뿐, 운영 데이터 늘어나면
--     인덱스 필요. 무작정 DROP 시 회귀 위험. 보존.
--
-- 진짜 dead 2건만 DROP:
--   · idx_news_keywords_gin — news-matching 은 welfare/loan target ILIKE 만 사용,
--     news_posts.keywords 는 SELECT 만. GIN 검색 0건
--   · idx_consent_type_version — lib/consent.ts 는 user_latest_consent VIEW +
--     (user_id, consent_type) 패턴만 사용. (consent_type, version) 조합 0건
--
-- 롤백:
--   CREATE INDEX idx_news_keywords_gin ON public.news_posts USING GIN (keywords);
--   CREATE INDEX idx_consent_type_version ON public.consent_log(consent_type, version);

drop index if exists public.idx_news_keywords_gin;
drop index if exists public.idx_consent_type_version;
