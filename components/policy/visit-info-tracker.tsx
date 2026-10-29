"use client";

import { useEffect } from "react";
import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
};

export function VisitInfoTracker({ programId, programTable, sourcePage }: Props) {
  useEffect(() => {
    trackPolicyDetailEvent({
      eventType: "apply_visit_info_view",
      programId,
      programTable,
      sourcePage,
    });
  }, [programId, programTable, sourcePage]);
  return null;
}
