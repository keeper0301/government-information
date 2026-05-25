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
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// 2026-05-25 region: vercel.json 의 functions.regions=["icn1"] 으로 설정 (project 레벨).
// Node runtime 의 preferredRegion export 는 Edge runtime 만 지원 → vercel.json 으로 우회.
// 미국 default region 의 한국 정부 site IP geo 차단 (광역 9건 fetch failed) 해소.
// 시·군 1개 = ~15s. 21 시·군 sequential = ~315s → 5/17 22:00 504 timeout.
// 5/18 parallel batch 도입: BATCH_SIZE=4 → 21/4=6 batches × 15s = ~90s (300s 충분 margin).
// 시·군 마다 다른 외부 도메인이라 동시 4 request 가 단일 site burst 위험 X.
export const maxDuration = 300;
const BATCH_SIZE = 4;

type CityResult = {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  error?: string;
};

async function scrapeCity(
  admin: ReturnType<typeof createAdminClient>,
  entry: (typeof CITY_REGISTRY)[number],
): Promise<CityResult> {
  try {
    const r = await entry.fn(admin, 10);
    await logAdminAction({
      actorId: null,
      action: "local_press_scrape",
      details: { trigger: "cron", ...r },
    });
    return r;
  } catch (e) {
    // 2026-05-22 fix — throw 시 invisible silent fail (audit 미기록) 사고 해소.
    // catch 안에서도 logAdminAction 호출 → /admin/scrape-local 페이지 + silent-fail-detect 가시화.
    const errorMessage = (e as Error).message;
    const errResult: CityResult = {
      city: entry.city,
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [errorMessage.slice(0, 200)],
      error: errorMessage,
    };
    try {
      await logAdminAction({
        actorId: null,
        action: "local_press_scrape",
        details: { trigger: "cron", ...errResult },
      });
    } catch {
      // audit insert 도 fail 하면 silent — 무한 throw 회피
    }
    return errResult;
  }
}

async function runScrape() {
  const admin = createAdminClient();
  const results: CityResult[] = [];

  // BATCH_SIZE 단위 병렬 처리 — chunk 간 sequential 로 외부 부하 분산.
  // 각 scrapeCity 가 try/catch 내장이라 Promise.all reject X (allSettled 불필요).
  for (let i = 0; i < CITY_REGISTRY.length; i += BATCH_SIZE) {
    const chunk = CITY_REGISTRY.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((entry) => scrapeCity(admin, entry)),
    );
    results.push(...chunkResults);
  }
  return results;
}

export async function GET(request: Request) {
  const authErr = authorizeCronRequest(request);
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
