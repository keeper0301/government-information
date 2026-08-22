import { NextResponse, type NextRequest } from "next/server";

import { buildPolicyReadbackSchedulerPreview } from "@/lib/aihub-policy-readback-scheduler-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseParam(request: NextRequest, key: string): number | undefined {
  const value = request.nextUrl.searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringParam(request: NextRequest, key: string): string | undefined {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value || undefined;
}

export async function GET(request: NextRequest) {
  const preview = await buildPolicyReadbackSchedulerPreview({
    itemLimit: parseParam(request, "limit"),
    sourceLimit: parseParam(request, "sources"),
    timeoutMs: parseParam(request, "timeoutMs"),
    baseUrl: parseStringParam(request, "baseUrl"),
  });

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
