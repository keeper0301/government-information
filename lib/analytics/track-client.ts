// ============================================================
// 클라이언트 click tracking helper — Phase A 사용자 분석
// ============================================================
// /api/events/track endpoint 호출. 실패는 UX 에 영향 없음.
// 페이지를 떠나는 클릭(tel:, 외부 링크, OAuth)은 sendBeacon.
// 그 외에는 keepalive fetch.
// ============================================================

"use client";

import type { UserEventType } from "@/lib/analytics/policy-events";

type EventType = UserEventType;

type TrackInput = {
  event_type: EventType;
  program_id?: string;
  program_table?: "welfare_programs" | "loan_programs" | "news_posts";
  source_page?: string;
  prior_event?: "apply_visit_info_view";
};

type TrackOptions = {
  // tel: · 외부 이동 · OAuth 리다이렉트는 keepalive fetch 가 문서 freeze 전에 취소된다.
  // sendBeacon 은 그 순간에도 전송 큐에 남는다.
  surviveNavigation?: boolean;
};

const TRACK_URL = "/api/events/track";

function postTrack(body: string, surviveNavigation: boolean): void {
  if (surviveNavigation && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(TRACK_URL, body)) return;
    } catch {
      // beacon 을 못 열면 아래 keepalive fetch 로 남긴다.
    }
  }
  fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // network 실패 graceful — log 안 함 (사용자 console 노이즈 차단)
  });
}

// fire-and-forget — 응답 기다리지 않음, 실패도 UX 영향 0
export function trackEvent(input: TrackInput, options?: TrackOptions): void {
  if (typeof window === "undefined") return;
  try {
    postTrack(JSON.stringify(input), options?.surviveNavigation === true);
  } catch {
    // sync throw 도 graceful
  }
}
