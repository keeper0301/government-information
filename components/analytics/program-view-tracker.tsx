// ============================================================
// 정책 상세 페이지 진입 시 program_view event 자동 기록
// ============================================================
// useEffect 1회만. server component 에서 mount.
// ============================================================

"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/track-client";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string; // 예: "/welfare/X" or "/loan/X"
};

export function ProgramViewTracker({ programId, programTable, sourcePage }: Props) {
  useEffect(() => {
    trackEvent({
      event_type: "program_view",
      program_id: programId,
      program_table: programTable,
      source_page: sourcePage,
    });
    // 의도적으로 deps 비움 — mount 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
