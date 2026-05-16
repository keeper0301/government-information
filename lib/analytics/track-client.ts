// ============================================================
// 클라이언트 click tracking helper — Phase A 사용자 분석
// ============================================================
// /api/events/track endpoint 호출. fetch 실패 graceful (UX 영향 0).
// ============================================================

"use client";

type EventType =
  | "program_view"
  | "apply_click"
  | "recommend_click"
  | "home_recommend_click";

type TrackInput = {
  event_type: EventType;
  program_id?: string;
  program_table?: "welfare_programs" | "loan_programs" | "news_posts";
  source_page?: string;
};

// fire-and-forget — 응답 기다리지 않음, 실패도 UX 영향 0
export function trackEvent(input: TrackInput): void {
  if (typeof window === "undefined") return;
  try {
    // keepalive — 페이지 navigate 도 안전 (apply_click → 외부 사이트 이동)
    fetch("/api/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {
      // network 실패 graceful — log 안 함 (사용자 console 노이즈 차단)
    });
  } catch {
    // sync throw 도 graceful
  }
}
