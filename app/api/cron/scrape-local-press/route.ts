// ============================================================
// /api/cron/scrape-local-press — 시·군 보도자료 매일 자동 수집
// ============================================================
// Phase B B1-b. Vercel cron 매일 KST 09:00 (UTC 00:00) 호출.
//
// 시·군 등록: lib/scraping/local-press/_registry.ts (single source of truth).
// 추가 시 그 파일에만 1줄 추가.
//
// auth: CRON_SECRET Bearer (vercel cron 자동 호출).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { logAdminAction } from "@/lib/admin-actions";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
// 시·군 1개 = ~15s. 20 시·군 = ~180s. Pro plan 300s 까지 가능 (5/17 G4 확장).
export const maxDuration = 300;

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function runScrape() {
  const admin = createAdminClient();
  const results: Array<{
    city: string;
    fetched: number;
    inserted: number;
    skipped: number;
    errors: string[];
    error?: string;
  }> = [];

  for (const entry of CITY_REGISTRY) {
    try {
      const r = await entry.fn(admin, 10);
      results.push(r);
      await logAdminAction({
        actorId: null,
        action: "local_press_scrape",
        details: {
          trigger: "cron",
          ...r,
        },
      });
    } catch (e) {
      results.push({
        city: entry.city,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        errors: [],
        error: (e as Error).message,
      });
    }
  }
  return results;
}

export async function GET(request: Request) {
  const authErr = await authorize(request);
  if (authErr) return authErr;

  try {
    const results = await runScrape();
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    await auditCronRun("local_press_scrape_run", {
      cities: results.length,
      total_inserted: totalInserted,
    });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

// POST alias — /admin/cron-trigger 가 self-POST 로 호출 가능
export const POST = GET;
