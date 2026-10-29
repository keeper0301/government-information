-- 정책 상세 신청 실행 카드 측정.
-- 주 지표 (apply_click + apply_call_click) / program_view 를 같은 테이블에서 계산한다.
-- bot user_agent 제외는 조회 시 필터로 유지한다.

ALTER TABLE public.user_events DROP CONSTRAINT IF EXISTS user_events_event_type_check;

ALTER TABLE public.user_events
  ADD CONSTRAINT user_events_event_type_check
  CHECK (event_type IN (
    'program_view',
    'apply_click',
    'recommend_click',
    'home_recommend_click',
    'apply_call_click',
    'apply_visit_info_view',
    'alimtalk_signup_click',
    'signup_from_detail'
  ));
