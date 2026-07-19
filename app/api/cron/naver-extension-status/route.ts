import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { getNaverExtensionStatus } from "@/lib/naver-blog/extension-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

async function run() {
  const status = await getNaverExtensionStatus();
  return NextResponse.json(
    { ok: status.errors.length === 0, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
