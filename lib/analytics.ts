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
  // 온보딩 5→3 단계 합치기 후 신규 funnel 이벤트 (2026-04-28 Phase 2)
  ONBOARDING_STEP_BASIC_COMPLETED: "onboarding_step_basic_completed",
  ONBOARDING_STEP_ELIGIBILITY_COMPLETED: "onboarding_step_eligibility_completed",
  ONBOARDING_STEP_INTERESTS_COMPLETED: "onboarding_step_interests_completed",
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
  SIGNUP_FAILED: "signup_failed",         // 가입 요청 실패 — reason 파라미터로 원인 세분
  LOGIN_COMPLETED: "login_completed",
  LOGIN_FAILED: "login_failed",           // 로그인 실패 — reason 파라미터 (wrong_password·user_not_found 등)
  // 비밀번호 재설정 퍼널 (이탈 지점 추적)
  PASSWORD_RESET_REQUESTED: "password_reset_requested", // /forgot-password 에서 메일 발송 요청
  PASSWORD_RESET_COMPLETED: "password_reset_completed", // /reset-password 에서 새 비번 저장 완료
  PASSWORD_RESET_FAILED: "password_reset_failed",       // 재설정 실패 — reason 파라미터
  // 계정 생명주기 (이탈 퍼널 분석)
  ACCOUNT_DELETED: "account_deleted",             // 최종 삭제 (30일 경과 cron 또는 즉시 요청)
  ACCOUNT_DELETION_BLOCKED: "account_deletion_blocked",
  ACCOUNT_DELETE_REQUESTED: "account_delete_requested",  // 30일 유예 요청 시점
  ACCOUNT_RESTORED: "account_restored",           // 유예 기간 내 복구 — 이탈 저지 효과 측정
  // 동의 관리 (신뢰 신호)
  CONSENT_WITHDRAWN: "consent_withdrawn",
  RECONSENT_ACKNOWLEDGED: "reconsent_acknowledged",
  // Phase 1.5 자격 정보 입력 유도 배너 (income/household 미입력자 대상)
  PROFILE_ENHANCE_BANNER_SHOWN: "profile_enhance_banner_shown",
  PROFILE_ENHANCE_BANNER_CLICKED: "profile_enhance_banner_clicked",
  PROFILE_ENHANCE_BANNER_DISMISSED: "profile_enhance_banner_dismissed",
  // /quiz funnel — 익명 진단 후 가입 전환·공유 측정
  QUIZ_SIGNUP_CLICKED: "quiz_signup_clicked",   // 결과 → 가입 버튼 클릭 (prefill 저장)
  QUIZ_SHARE_CLICKED: "quiz_share_clicked",     // 결과 공유 버튼 클릭
  QUIZ_PREFILL_APPLIED: "quiz_prefill_applied", // 온보딩에서 prefill 자동 채움 발생
  // 홈 인터랙션 funnel (2026-04-28 — 어디서 사용자가 어디로 이동하는지)
  HOME_SEARCH_CHIP_CLICKED: "home_search_chip_clicked",     // Hero chip 6종 클릭
  HOME_SEARCH_SUBMITTED: "home_search_submitted",           // 검색 폼 제출
  HOME_TARGET_CARD_CLICKED: "home_target_card_clicked",     // 대상별 카드 6종 (b617f42)
  HOME_POPULAR_CLICKED: "home_popular_clicked",             // 인기 정책 TOP 5 클릭
  HOME_REGION_CARD_CLICKED: "home_region_card_clicked",     // 지역별 카드 17개
  HOME_VALUE_PROPS_SHOWN: "home_value_props_shown",         // 가치 카드 노출 (페이지뷰 보조)
  HOME_POPULAR_SIGNUP_CTA: "home_popular_signup_cta",       // 인기 정책 사이드 배너 끝 회원가입 CTA 클릭
  HOME_POPULAR_DISMISSED: "home_popular_dismissed",         // 인기 정책 사이드 배너 닫기 (사용자 피로도 측정)
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
