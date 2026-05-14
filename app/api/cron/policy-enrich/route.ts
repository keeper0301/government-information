// ============================================================
// 다 묶음 — 정책 키워드 + 카드 요약 자동 추출 cron.
// ============================================================
// 매일 KST 03:30 (UTC 18:30 전날) — 트래픽 적은 시간.
// welfare/loan 각 15건씩 LLM enrichPolicy + UPDATE.
// 검색 정확도 (keywords) + 카드 UX (summary_short) 동시 향상.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichPolicy } from "@/lib/policy/enrich";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_PER_TABLE = 15; // welfare 15 + loan 15 = 30건/일

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

interface PolicyRow {
  id: string;
  title: string;
  target: string | null;
  eligibility: string | null;
  benefits: string | null;
  description: string | null;
}

async function processTable(
  admin: ReturnType<typeof createAdminClient>,
  table: "welfare_programs" | "loan_programs",
): Promise<{ enriched: number; failed: number; skipped: number }> {
  // keywords IS NULL 또는 summary_short IS NULL — 둘 중 하나라도 미채움인 정책
  const { data, error } = await admin
    .from(table)
    .select("id, title, target, eligibility, benefits, description")
    .or("keywords.is.null,summary_short.is.null")
    .eq("is_hidden", false)
    .limit(BATCH_PER_TABLE);

  if (error) {
    console.warn(`[policy-enrich] ${table} fetch 실패:`, error.message);
    return { enriched: 0, failed: 0, skipped: 0 };
  }

  const rows = (data ?? []) as PolicyRow[];
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of rows) {
    const result = await enrichPolicy({
      title: r.title,
      target: r.target,
      eligibility: r.eligibility,
      benefits: r.benefits,
      description: r.description,
    });
    if (result.keywords.length === 0 && !result.summaryShort) {
      skipped += 1;
      continue;
    }
    const updates: Record<string, unknown> = {};
    if (result.keywords.length > 0) updates.keywords = result.keywords;
    if (result.summaryShort) updates.summary_short = result.summaryShort;

    const { error: updateErr } = await admin.from(table).update(updates).eq("id", r.id);
    if (updateErr) failed += 1;
    else enriched += 1;
  }

  return { enriched, failed, skipped };
}

async function run() {
  const admin = createAdminClient();
  const start = Date.now();

  const [welfare, loan] = await Promise.all([
    processTable(admin, "welfare_programs"),
    processTable(admin, "loan_programs"),
  ]);
  const durationMs = Date.now() - start;

  // 2026-05-14 — cron 가동 흔적 audit (가시성 강화)
  await auditCronRun("policy_enrich_run", {
    welfare_enriched: welfare.enriched,
    welfare_failed: welfare.failed,
    welfare_skipped: welfare.skipped,
    loan_enriched: loan.enriched,
    loan_failed: loan.failed,
    loan_skipped: loan.skipped,
    duration_ms: durationMs,
  });

  return NextResponse.json({
    ok: true,
    welfare,
    loan,
    duration_ms: durationMs,
  });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return run();
}
