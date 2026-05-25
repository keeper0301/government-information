// app/api/auto-confirm-stats/route.ts
// B안 자동 confirm 24h+7d 통계 GET endpoint.
// 사용처: claude.ai routine (24h 후 1회) — Vercel MCP 로 CRON_SECRET 조회 후 fetch.
// 응답 구조는 routine prompt 가 그대로 메일 본문 빌드에 사용.
//
// 5/17 — getPressIngestTierStats helper 분리. 같은 데이터를 autonomous hub
// PressIngestTierCard 도 공유 (DRY + 1주차 모니터링 spec 자연 follow-up).
//
// 인증: CRON_SECRET Bearer (cron route 와 동일 패턴).
// 보안: 통계 카운트만 노출 (PII 0). 인증 실패 시 401.

import { NextResponse } from "next/server";
import { getPressIngestTierStats } from "@/lib/analytics/press-ingest-tier-stats";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const stats = await getPressIngestTierStats();
  return NextResponse.json(stats);
}
