"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trackPolicyDetailEvent } from "@/lib/analytics/policy-detail-events";
import {
  isVisitInfoVisible,
  reduceVisitInfoView,
  type VisitInfoViewState,
} from "@/lib/analytics/visit-info-view";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs";
  sourcePage: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
};

export function VisitInfoTracker({
  programId,
  programTable,
  sourcePage,
  active = true,
  className,
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!active || !node || typeof IntersectionObserver === "undefined") return;

    let state: VisitInfoViewState = { scrolled: false, visible: false, recorded: false };
    const apply = (event: Parameters<typeof reduceVisitInfoView>[1]) => {
      const next = reduceVisitInfoView(state, event);
      state = next.state;
      if (!next.record) return;
      trackPolicyDetailEvent({
        eventType: "apply_visit_info_view",
        programId,
        programTable,
        sourcePage,
      });
    };

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      apply({ type: "visibility", visible: isVisitInfoVisible(entry) });
    });
    const onScroll = () => apply({ type: "scroll" });

    observer.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [active, programId, programTable, sourcePage]);

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}
