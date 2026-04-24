// ============================================================
// GA4 이벤트 트래킹 헬퍼
// ============================================================
// 클라이언트 컴포넌트에서 `trackEvent(EVENTS.TOPIC_SAVED, { count: 3 })` 처럼 호출.
// 서버 컴포넌트는 별도 tracker 컴포넌트 (PageViewTracker) 를 import.
//
// GA4 미로드 상태 (개발 localhost, adblock 사용자) 에선 조용히 no-op.
// 프로덕션에서 최소한의 비교 지표만 수집 — 상세 퍼포먼스 이벤트는 추후.
//
// @next/third-parties/google 의 GoogleAnalytics 가 layout.tsx 에 설치돼 있어
// window.gtag 가 전역 주입됨. 그 gtag 를 직접 호출.
//
// ⚠️ "use client" 를 파일에 넣지 않음 — 나중에 서버 action 에서 불릴 수 있고,
// lib/ 헬퍼는 빌드 경계 안전하도록 중립 유지. 실제 실행 시 window 가드로 no-op.
// ============================================================

// 이벤트 이름 상수 — 타입 안전성. 새 이벤트 추가 시 여기부터.
export const EVENTS = {
  // 온보딩
  TOPIC_SAVED: "topic_saved",
  ONBOARDING_SKIPPED: "onboarding_skipped",
  // 추천
  RECOMMEND_SUBMITTED: "recommend_submitted",
  // 결제 / 구독
  PRICING_VIEWED: "pricing_viewed",
  CHECKOUT_STARTED: "checkout_started",
  // AI 상담
  AI_CHAT_SENT: "ai_chat_sent",
  // 블로그
  BLOG_POST_VIEWED: "blog_post_viewed",
  // 인증 (가입·로그인 전환율)
  SIGNUP_INITIATED: "signup_initiated",   // 가입 요청(메일 발송)까지 성공 — 메일 확인 전 drop-off 측정 기반
  SIGNUP_COMPLETED: "signup_completed",   // 확인 메일 클릭 → callback 에서 isNewUser 판정
  LOGIN_COMPLETED: "login_completed",
  // 계정 생명주기 (이탈 퍼널 분석)
  ACCOUNT_DELETED: "account_deleted",
  ACCOUNT_DELETION_BLOCKED: "account_deletion_blocked",
  // 동의 관리 (신뢰 신호)
  CONSENT_WITHDRAWN: "consent_withdrawn",
  RECONSENT_ACKNOWLEDGED: "reconsent_acknowledged",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// gtag 전역 타입 (Next.js 환경에서는 선언 안 되어 있어 any 로 캐스팅)
type GtagFn = (
  command: "event",
  eventName: string,
  params?: Record<string, unknown>,
) => void;

/**
 * GA4 이벤트 전송.
 *
 * @param eventName EVENTS 상수 중 하나 (또는 임시 이름)
 * @param params 이벤트 파라미터 (GA4 의 커스텀 파라미터로 전달). 값은 문자열·숫자·불리언만.
 */
export function trackEvent(
  eventName: EventName | string,
  params?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: GtagFn };
  if (typeof w.gtag !== "function") return;
  try {
    w.gtag("event", eventName, params);
  } catch {
    // GA 스크립트가 adblock 등으로 막힌 경우 — 조용히 무시
  }
}
