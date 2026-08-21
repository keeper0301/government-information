import { NextResponse, type NextRequest } from "next/server";

import { buildPolicyOfficialReadbackPreview } from "@/lib/aihub-policy-official-readback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const preview = await buildPolicyOfficialReadbackPreview(undefined, {
    itemLimit: parseLimit(request.nextUrl.searchParams.get("limit")),
    sourceLimit: parseLimit(request.nextUrl.searchParams.get("sources")),
  });

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
