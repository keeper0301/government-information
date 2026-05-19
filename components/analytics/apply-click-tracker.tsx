// ============================================================
// apply 버튼 wrapper — click 시 apply_click event 기록 + 외부 link 이동
// ============================================================
// keepalive 로 navigate 도 안전. target="_blank" 라 페이지는 그대로.
// ============================================================

"use client";

import { trackEvent } from "@/lib/analytics/track-client";
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
    trackEvent({
      event_type: "apply_click",
      program_id: programId,
      program_table: programTable,
      source_page: sourcePage,
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
