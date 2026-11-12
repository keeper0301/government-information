"use client";

import type { ReactNode } from "react";
import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
  href: string;
  className?: string;
  children: ReactNode;
};

export function PhoneClickLink({
  programId,
  programTable,
  sourcePage,
  href,
  className,
  children,
}: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        // 동기 호출. trackPolicyDetailEvent 가 sendBeacon 으로 tel: 이동 전에 큐에 넣는다.
        trackPolicyDetailEvent({
          eventType: "apply_call_click",
          programId,
          programTable,
          sourcePage,
        });
      }}
    >
      {children}
    </a>
  );
}
