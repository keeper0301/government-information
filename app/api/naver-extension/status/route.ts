import { NextResponse } from "next/server";
import { getNaverExtensionStatus } from "@/lib/naver-blog/extension-status";
import { authorizeNaverExtensionRequest } from "@/lib/naver-extension-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  const denied = authorizeNaverExtensionRequest(request);
  if (denied) return denied;

  const status = await getNaverExtensionStatus();
  return NextResponse.json({ ok: status.errors.length === 0, ...status });
}
