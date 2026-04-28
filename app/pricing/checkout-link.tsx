"use client";

// ============================================================
// CheckoutLink — pricing CTA 클릭 시 GA4 이벤트 + 이동
// ============================================================
// 서버 컴포넌트인 /pricing 에서 이 클라이언트 컴포넌트를 import 해 유료 플랜
// CTA 에 사용. checkout_started 이벤트를 전송한 뒤 링크 이동.
// preventDefault 없이 gtag 는 sendBeacon 을 쓰기 때문에 이벤트 유실 거의 없음.
// ============================================================

import { trackEvent, EVENTS } from "@/lib/analytics";

type Props = {
  href: string;
  tier: string;
  /** 현재 로그인 여부 — 비로그인 상태에서 클릭 시 로그인 후 복귀 흐름이라 분리 리포트에 활용 */
  isLoggedIn: boolean;
  className: string;
  children: React.ReactNode;
};

export function CheckoutLink({ href, tier, isLoggedIn, className, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        // Phase 4 — 결제 funnel 단계별 측정 (PLAN_SELECTED 가 더 일찍의 의도)
        trackEvent(EVENTS.PRICING_PLAN_SELECTED, { plan: tier });
        trackEvent(EVENTS.CHECKOUT_STARTED, {
          tier,
          is_logged_in: isLoggedIn,
        });
      }}
    >
      {children}
    </a>
  );
}
