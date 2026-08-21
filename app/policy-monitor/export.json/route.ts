import { NextResponse } from "next/server";

import { buildPolicyExportRows } from "@/lib/aihub-policy-opportunities";

export const dynamic = "force-static";

export function GET() {
  const rows = buildPolicyExportRows();

  return NextResponse.json(
    {
      generatedFor: "AIHub 4순위 W1 정책 글감 후보",
      year: 2026,
      status: "read_only_export",
      count: rows.length,
      rows,
      safety: {
        dbWrite: false,
        publish: false,
        gscSubmit: false,
        indexNowSubmit: false,
        requiresFactReadbackBeforeDraft: true,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
