import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { submitSearchConsoleSitemap } from "@/lib/external-console/search-console";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run() {
  try {
    const result = await submitSearchConsoleSitemap({
      sitemapUrl: "https://www.keepioo.com/sitemap.xml",
    });
    await auditCronRun("external_console_check_run", {
      task: "search_console_sitemap_submit",
      site_url: result.siteUrl,
      sitemap_url: result.sitemapUrl,
      status: result.status,
    });
    return NextResponse.json({
      ok: true,
      site_url: result.siteUrl,
      sitemap_url: result.sitemapUrl,
      status: result.status,
      body_len: result.body.length,
    });
  } catch (e) {
    const message = (e as Error).message;
    await auditCronRun("external_console_check_run", {
      task: "search_console_sitemap_submit",
      ok: false,
      error: message.slice(0, 500),
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("credentials missing") ? 503 : 502 },
    );
  }
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
