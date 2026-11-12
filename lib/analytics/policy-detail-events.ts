"use client";

// 정책 상세 이벤트를 user_events 와 GA4 에 같은 이름·정책 id 로 남긴다.
// 주 지표: (apply_click + apply_call_click) / program_view

import { trackEvent as trackGa4 } from "@/lib/analytics";
import { trackEvent as trackUserEvent } from "@/lib/analytics/track-client";
import type { PolicyDetailEventType } from "@/lib/analytics/policy-events";

const NAVIGATION_EVENTS = new Set<PolicyDetailEventType>([
  "apply_click",
  "apply_call_click",
  "alimtalk_signup_click",
]);

const FOLLOW_ON_EVENTS = new Set<PolicyDetailEventType>([
  "apply_click",
  "apply_call_click",
]);

const visitInfoViewedPrograms = new Set<string>();

export function resetPolicyDetailFunnelForTests(): void {
  visitInfoViewedPrograms.clear();
}

export function trackPolicyDetailEvent(input: {
  eventType: PolicyDetailEventType;
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
}): void {
  if (input.eventType === "apply_visit_info_view") {
    visitInfoViewedPrograms.add(input.programId);
  }
  const priorEvent = FOLLOW_ON_EVENTS.has(input.eventType) && visitInfoViewedPrograms.has(input.programId)
    ? "apply_visit_info_view" as const
    : undefined;
  const surviveNavigation = NAVIGATION_EVENTS.has(input.eventType);

  trackUserEvent({
    event_type: input.eventType,
    program_id: input.programId,
    program_table: input.programTable,
    source_page: input.sourcePage,
    ...(priorEvent ? { prior_event: priorEvent } : {}),
  }, { surviveNavigation });
  trackGa4(input.eventType, {
    policy_id: input.programId,
    program_id: input.programId,
    program_table: input.programTable,
    source_page: input.sourcePage,
    ...(priorEvent ? { prior_event: priorEvent } : {}),
    ...(surviveNavigation ? { transport_type: "beacon" as const } : {}),
  });
}
