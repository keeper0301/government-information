import { NextResponse, type NextRequest } from "next/server";

import { buildPolicyHumanizeReviewQueue } from "@/lib/aihub-policy-humanize-review-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseParam(request: NextRequest, key: string): number | undefined {
  const value = request.nextUrl.searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const queue = await buildPolicyHumanizeReviewQueue({
    itemLimit: parseParam(request, "limit"),
    sourceLimit: parseParam(request, "sources"),
    timeoutMs: parseParam(request, "timeoutMs"),
  });

  return NextResponse.json(queue, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
