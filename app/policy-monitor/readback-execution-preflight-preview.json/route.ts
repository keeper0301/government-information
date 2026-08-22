import { NextResponse, type NextRequest } from "next/server";

import {
  buildPolicyReadbackExecutionPreflightPreview,
  type BuildReadbackExecutionPreflightPreviewOptions,
} from "@/lib/aihub-policy-readback-execution-preflight-preview";

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

function parseSlotParam(request: NextRequest): BuildReadbackExecutionPreflightPreviewOptions["slot"] {
  const value = parseStringParam(request, "slot");
  if (value === "immediate" || value === "after_24h" || value === "after_72h" || value === "all") return value;
  return undefined;
}

export async function GET(request: NextRequest) {
  const preview = await buildPolicyReadbackExecutionPreflightPreview({
    itemLimit: parseParam(request, "limit"),
    sourceLimit: parseParam(request, "sources"),
    timeoutMs: parseParam(request, "timeoutMs"),
    baseUrl: parseStringParam(request, "baseUrl"),
    slot: parseSlotParam(request),
  });

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
