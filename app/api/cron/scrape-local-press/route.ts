// ============================================================
// /api/cron/scrape-local-press — 시·군 보도자료 매일 자동 수집
// ============================================================
// Phase B B1-b. Vercel cron 매일 KST 09:00 (UTC 00:00) 호출.
//
// 현재 가동: 순천시청 (사장님 거주지). 향후 다른 시·군 같은 cron 안에 추가.
//
// auth: CRON_SECRET Bearer (vercel cron 자동 호출).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeSuncheonAndInsert } from "@/lib/scraping/local-press/suncheon";
import { scrapeGwangjuAndInsert } from "@/lib/scraping/local-press/gwangju";
import { scrapeSeoulAndInsert } from "@/lib/scraping/local-press/seoul";
import { scrapeSuwonAndInsert } from "@/lib/scraping/local-press/suwon";
import { scrapeBusanAndInsert } from "@/lib/scraping/local-press/busan";
import { scrapeIncheonAndInsert } from "@/lib/scraping/local-press/incheon";
import { scrapeDaejeonAndInsert } from "@/lib/scraping/local-press/daejeon";
import { scrapeUlsanAndInsert } from "@/lib/scraping/local-press/ulsan";
import { scrapeGoyangAndInsert } from "@/lib/scraping/local-press/goyang";
import { logAdminAction } from "@/lib/admin-actions";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
// 시·군 1개 = ~15s. 8 시·군 = ~120s. Pro plan 300s 까지 가능 (5/17 G4 확장).
export const maxDuration = 180;

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

// 시·군 collector 목록 — Phase B 확장 시 여기에 추가.
// 각 collector 는 admin client + limit 받아 ScrapeResult 반환.
const COLLECTORS = [
  { city: "순천시", fn: scrapeSuncheonAndInsert },
  { city: "광주광역시", fn: scrapeGwangjuAndInsert },
  { city: "서울특별시", fn: scrapeSeoulAndInsert },
  { city: "수원시", fn: scrapeSuwonAndInsert },
  { city: "부산광역시", fn: scrapeBusanAndInsert },
  { city: "인천광역시", fn: scrapeIncheonAndInsert },
  { city: "대전광역시", fn: scrapeDaejeonAndInsert },
  { city: "울산광역시", fn: scrapeUlsanAndInsert },
  { city: "고양특례시", fn: scrapeGoyangAndInsert },
];

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

  for (const collector of COLLECTORS) {
    try {
      const r = await collector.fn(admin, 10);
      results.push(r);
      await logAdminAction({
        actorId: null,
        action: "local_press_scrape",
        details: {
          ministry: "전라남도 순천시",
          trigger: "cron",
          ...r,
        },
      });
    } catch (e) {
      results.push({
        city: collector.city,
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
