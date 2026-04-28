// ============================================================
// TrackedLink — server component 안에서 GA4 이벤트 추적용 Link wrapper
// ============================================================
// next/link 의 onClick 은 client 핸들러라 server component 안에서 직접
// 줄 수 없음. TrackedLink 가 그 사이를 잇는 client wrapper.
//
// 사용 예:
//   <TrackedLink href="/foo" event={EVENTS.HOME_TARGET_CARD_CLICKED}
//                params={{ label: '청년' }}>...children</TrackedLink>
// ============================================================

"use client";

import Link, { type LinkProps } from "next/link";
import { trackEvent, type EventName } from "@/lib/analytics";

// LinkProps + 일반 anchor attribute (className·title·aria-* 등) 모두 통과
type Props = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    event: EventName;
    params?: Record<string, string | number | boolean>;
    children: React.ReactNode;
  };

export function TrackedLink({ event, params, children, ...linkProps }: Props) {
  return (
    <Link {...linkProps} onClick={() => trackEvent(event, params)}>
      {children}
    </Link>
  );
}
