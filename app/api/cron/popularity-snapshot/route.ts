// ============================================================
// /api/cron/popularity-snapshot — 매일 popularity 누적 (A 12차)
// ============================================================
// 매일 KST 03:00 (UTC 18:00 전일) — user_events 30일 popularity 계산 →
// popularity_snapshots 테이블에 그날의 score/views/applies 행 누적.
//
// autonomous hub PopularityTrendCard 가 이 테이블을 읽어 30일 추세 시각화.
// 30일 이상 데이터는 cleanup (테이블 무한 증가 차단).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { auditCronRun } from "@/lib/ops/audit-cron-run";
import { loadCurrentWeights } from "@/lib/personalization/popularity-weights-settings";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Spec 2 (5/27): 학습된 weights 를 5분 cache 로 조회. cron 미가동/DB 실패 시 default fallback.

async function run() {
  const admin = createAdminClient();
  const w = await loadCurrentWeights();
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  // 1) 직전 30일 user_events 집계 — popularity-boost.ts 와 동일 로직
  // PostgREST max 1000행 — 30일 user_events 를 .limit(20000) 으로 받아도 1000건에서
  // 잘려 snapshot 집계가 왜곡된다(코드리뷰). .range() 페이지네이션으로 전량 수집.
  const { rows: events, error: eventErr } = await fetchAllRows<{
    program_id: string;
    program_table: string | null;
    event_type: string;
  }>((from, to) =>
    admin
      .from("user_events")
      .select("program_id, program_table, event_type")
      .gte("created_at", since)
      .not("program_id", "is", null)
      .in("event_type", ["program_view", "apply_click"])
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  if (eventErr) {
    return { success: false, error: eventErr, inserted: 0, cleaned: 0 };
  }

  // program_id 별 집계
  const agg = new Map<
    string,
    { program_table: string; views: number; applies: number; score: number }
  >();
  for (const row of (events ?? []) as Array<{
    program_id: string;
    program_table: string | null;
    event_type: string;
  }>) {
    if (!row.program_id || !row.program_table) continue;
    const entry = agg.get(row.program_id) ?? {
      program_table: row.program_table,
      views: 0,
      applies: 0,
      score: 0,
    };
    if (row.event_type === "program_view") entry.views += 1;
    if (row.event_type === "apply_click") entry.applies += 1;
    entry.score = Math.min(
      w.maxBoost,
      entry.views * w.viewWeight + entry.applies * w.applyWeight,
    );
    agg.set(row.program_id, entry);
  }

  // 2) snapshot insert — UNIQUE(snapshot_date, program_id) 로 중복 차단.
  // 같은 날 재실행 시 ON CONFLICT DO UPDATE 패턴으로 최신값 덮어쓰기.
  const rows = [...agg.entries()].map(([program_id, e]) => ({
    snapshot_date: today,
    program_id,
    program_table: e.program_table,
    score: e.score,
    views: e.views,
    applies: e.applies,
  }));

  let inserted = 0;
  if (rows.length > 0) {
    const { error: insertErr } = await admin
      .from("popularity_snapshots")
      .upsert(rows, { onConflict: "snapshot_date,program_id" });
    if (insertErr) {
      return {
        success: false,
        error: insertErr.message,
        inserted: 0,
        cleaned: 0,
      };
    }
    inserted = rows.length;
  }

  // 3) 30일 이상 cleanup — 테이블 무한 증가 차단
  const cutoff = new Date(Date.now() - 31 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const { count: cleaned } = await admin
    .from("popularity_snapshots")
    .delete({ count: "exact" })
    .lt("snapshot_date", cutoff);

  return { success: true, inserted, cleaned: cleaned ?? 0 };
}

export async function GET(request: Request) {
  const unauth = authorizeCronRequest(request);
  if (unauth) return unauth;
  const result = await run();
  await auditCronRun("popularity_snapshot_run", {
    success: result.success,
    inserted: result.inserted,
    cleaned: result.cleaned,
    error: result.success ? undefined : result.error,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
