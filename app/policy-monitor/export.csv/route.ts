import { buildPolicyExportCsv } from "@/lib/aihub-policy-opportunities";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildPolicyExportCsv(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": 'attachment; filename="aihub-policy-monitor-2026.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
