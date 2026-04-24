"use client";

// ============================================================
// AuthEventTracker — OAuth callback → GA4 이벤트 브릿지
// ============================================================
// /auth/callback 은 서버 route 라 gtag 직접 호출 불가.
// callback 이 redirect URL 에 ?auth_event=signup|login 마커를 실어 보내면
// 이 컴포넌트가 클라이언트에서 감지 → trackEvent 호출 → URL 에서 쿼리 제거.
//
// layout.tsx 에 하나만 두면 어느 next 경로로 redirect 돼도 감지됨.
//
// 중복 트래킹 방지:
//   - router.replace 로 쿼리 제거 (history 스택 변경 없이 URL 만 갱신)
//   - useEffect 의존성이 searchParams 이므로 replace 후 재실행되지만
//     event 값이 없어서 early return
// ============================================================

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";

export function AuthEventTracker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const event = searchParams.get("auth_event");
    if (event !== "signup" && event !== "login") return;

    trackEvent(
      event === "signup" ? EVENTS.SIGNUP_COMPLETED : EVENTS.LOGIN_COMPLETED,
    );

    // URL 에서 auth_event 쿼리만 제거. 다른 쿼리 (next 등) 는 유지.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth_event");
    const rest = params.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return null;
}
