-- ============================================================
-- subscriptions.status CHECK 제약에 'manual_grant' 추가
-- ============================================================
-- 어드민 수동 티어 부여(app/admin/users/[userId]/page.tsx)가 신규 사용자에게
-- status='manual_grant' 로 INSERT 하는데, 기존 CHECK 제약에 manual_grant 가 없어
-- CHECK 위반으로 INSERT 가 실패하던 버그 수정 (2026-06-05 코드리뷰 후속).
-- lib/admin-stats·admin-insights·admin/page 의 ACTIVE_STATUSES 도 manual_grant 를
-- 활성 구독으로 집계하므로, 값을 허용해야 어드민 수동부여 구독이 정상 동작·집계된다.
--
-- 허용 값 확장(기존 7개 + manual_grant)이라 기존 데이터 위반 0. DROP+ADD 를 한
-- 마이그레이션(트랜잭션) 안에서 수행해 제약 공백 구간 없음.
-- ============================================================

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'free', 'pending', 'trialing', 'active',
    'charging', 'past_due', 'cancelled', 'manual_grant'
  ));
