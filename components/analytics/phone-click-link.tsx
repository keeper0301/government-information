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
      onClick={() =>
        trackPolicyDetailEvent({
          eventType: "apply_call_click",
          programId,
          programTable,
          sourcePage,
        })
      }
    >
      {children}
    </a>
  );
}
