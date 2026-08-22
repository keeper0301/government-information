import { NextResponse, type NextRequest } from "next/server";

import { buildPolicyLivePublishPreflightPreview } from "@/lib/aihub-policy-live-publish-preflight-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseParam(request: NextRequest, key: string): number | undefined {
  const value = request.nextUrl.searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const preview = await buildPolicyLivePublishPreflightPreview({
    itemLimit: parseParam(request, "limit"),
    sourceLimit: parseParam(request, "sources"),
    timeoutMs: parseParam(request, "timeoutMs"),
  });

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
