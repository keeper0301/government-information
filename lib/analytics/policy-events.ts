// 정책 상세 신청 행동 이벤트.
// user_events 와 GA4 가 같은 이름을 써야
// (apply_click + apply_call_click) / program_view 를 같은 정책 id 로 계산할 수 있다.

export const POLICY_DETAIL_EVENT_TYPES = [
  "program_view",
  "apply_click",
  "apply_call_click",
  "apply_visit_info_view",
  "alimtalk_signup_click",
  "signup_from_detail",
] as const;

export const USER_EVENT_TYPES = [
  ...POLICY_DETAIL_EVENT_TYPES,
  "recommend_click",
  "home_recommend_click",
] as const;

export type PolicyDetailEventType = (typeof POLICY_DETAIL_EVENT_TYPES)[number];
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

const USER_EVENT_TYPE_SET: ReadonlySet<string> = new Set(USER_EVENT_TYPES);

export function isUserEventType(value: string): value is UserEventType {
  return USER_EVENT_TYPE_SET.has(value);
}

export function isPolicyDetailEventType(value: string): value is PolicyDetailEventType {
  return (POLICY_DETAIL_EVENT_TYPES as readonly string[]).includes(value);
}
