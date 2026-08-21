import { NextResponse } from "next/server";

import { summarizePolicyDraftQueue } from "@/lib/aihub-policy-draft-queue";

export const dynamic = "force-static";

export function GET() {
  const queue = summarizePolicyDraftQueue();

  return NextResponse.json(queue, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
