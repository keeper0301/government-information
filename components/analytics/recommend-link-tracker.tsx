// ============================================================
// 추천 카드 link wrapper — click 시 recommend_click / home_recommend_click 기록
// ============================================================
// Next.js Link 와 호환. onClick beforeunload safe (keepalive trackEvent).
// ============================================================

"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics/track-client";
import type { ReactNode } from "react";

type Props = {
  programId: string;
  programTable: "welfare_programs" | "loan_programs" | "news_posts";
  // 추천 위치 — 어디서 클릭됐는지
  eventType: "recommend_click" | "home_recommend_click";
  sourcePage: string;
  href: string;
  className?: string;
  children: ReactNode;
};

export function RecommendLinkTracker({
  programId,
  programTable,
  eventType,
  sourcePage,
  href,
  className,
  children,
}: Props) {
  function onClick() {
    trackEvent({
      event_type: eventType,
      program_id: programId,
      program_table: programTable,
      source_page: sourcePage,
    });
    // Link 가 navigate 처리. preventDefault X.
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
