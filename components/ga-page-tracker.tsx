"use client";

// ============================================================
// GaPageTracker — 특정 페이지 방문 시 GA4 이벤트 전송
// ============================================================
// 서버 컴포넌트에서 `<GaPageTracker eventName="pricing_viewed" />` 처럼 삽입.
// GA4 의 기본 page_view 는 모든 페이지에 찍히지만, 전환 퍼널 분석용 커스텀
// 이벤트는 따로 쏘는 편이 쿼리·세그먼트 구성이 쉬워서 편함.
// ============================================================

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  eventName: string;
  params?: Record<string, string | number | boolean>;
};

export function GaPageTracker({ eventName, params }: Props) {
  useEffect(() => {
    trackEvent(eventName, params);
    // params 는 매 마운트마다 새 객체라 의존성 안 넣음 — 한 번만 트리거가 의도.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName]);
  return null;
}
