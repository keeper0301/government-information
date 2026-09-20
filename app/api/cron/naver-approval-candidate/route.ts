import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { getNaverApprovalCandidate } from "@/lib/naver-blog/approval-candidate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await getNaverApprovalCandidate();
  return NextResponse.json(
    { ok: result.status === "ready_for_exact_approval", ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}