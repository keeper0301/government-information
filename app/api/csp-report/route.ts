import { NextResponse } from "next/server";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CSP_REPORT_BYTES = 16 * 1024;
const MAX_FIELD_LENGTH = 500;

type RawCspReport = {
  "csp-report"?: Record<string, unknown>;
};

function cleanField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, MAX_FIELD_LENGTH);
}

export async function POST(request: Request) {
  let body: RawCspReport;
  try {
    body = await readJsonWithLimit<RawCspReport>(request, MAX_CSP_REPORT_BYTES);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid_json" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  const report = body["csp-report"];
  if (!report || typeof report !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_csp_report" }, { status: 400 });
  }

  // Do not persist or echo full URLs. CSP reports can contain path/query data.
  // Vercel logs are enough for the first report-only observation pass.
  console.warn(JSON.stringify({
    kind: "csp-report-only-violation",
    blockedUri: cleanField(report["blocked-uri"]),
    violatedDirective: cleanField(report["violated-directive"]),
    effectiveDirective: cleanField(report["effective-directive"]),
    disposition: cleanField(report.disposition),
    sourceFile: cleanField(report["source-file"]),
    lineNumber: typeof report["line-number"] === "number" ? report["line-number"] : undefined,
    statusCode: typeof report["status-code"] === "number" ? report["status-code"] : undefined,
  }));

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
