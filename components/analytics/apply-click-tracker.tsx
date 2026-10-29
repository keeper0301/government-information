// ============================================================
// apply 버튼 wrapper — click 시 apply_click event 기록 + 외부 link 이동
// ============================================================
// keepalive 로 navigate 도 안전. target="_blank" 라 페이지는 그대로.
// ============================================================

"use client";

import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";
import type { ReactNode } from "react";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
  href: string;
  className?: string;
  children: ReactNode;
};

export function ApplyClickTracker({
  programId,
  programTable,
  sourcePage,
  href,
  className,
  children,
}: Props) {
  function onClick() {
    trackPolicyDetailEvent({
      eventType: "apply_click",
      programId,
      programTable,
      sourcePage,
    });
    // navigate 는 anchor 가 처리 (preventDefault X)
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
