// ============================================================
// A4 — 카테고리 누락 정책 LLM 자동 보강 cron.
// ============================================================
// 매일 KST 03:00 (UTC 18:00 전날) 실행 — 트래픽 적은 시간.
// welfare/loan WHERE category IS NULL OR ='' 인 정책 50건씩 LLM 분류 + UPDATE.
// 사용자 검색·필터 정확도 향상 (지금까지 사장님이 수동 처리해야 했던 부분).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyCategory,
  type ProgramTable,
} from "@/lib/support/category-classify";
import { logAdminAction } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT_PER_TABLE = 25; // welfare 25 + loan 25 = 50건/일

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

interface MissingProgram {
  id: string;
  title: string;
  target: string | null;
  eligibility: string | null;
  benefits: string | null;
}

async function fetchMissing(
  admin: ReturnType<typeof createAdminClient>,
  table: ProgramTable,
): Promise<MissingProgram[]> {
  const { data, error } = await admin
    .from(table)
    .select("id, title, target, eligibility, benefits")
    .or("category.is.null,category.eq.")
    .eq("is_hidden", false)
    .limit(BATCH_LIMIT_PER_TABLE);
  if (error) {
    console.warn(`[category-backfill] ${table} fetch 실패:`, error.message);
    return [];
  }
  return (data ?? []) as MissingProgram[];
}

async function processTable(
  admin: ReturnType<typeof createAdminClient>,
  table: ProgramTable,
): Promise<{ filled: number; failed: number; skipped: number }> {
  const programs = await fetchMissing(admin, table);
  let filled = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of programs) {
    const result = await classifyCategory({
      table,
      title: p.title,
      target: p.target,
      eligibility: p.eligibility,
      benefits: p.benefits,
    });
    if (!result.category) {
      skipped += 1;
      continue;
    }
    const { error: updateErr } = await admin
      .from(table)
      .update({ category: result.category })
      .eq("id", p.id);
    if (updateErr) {
      failed += 1;
    } else {
      filled += 1;
    }
  }

  return { filled, failed, skipped };
}

async function run() {
  const admin = createAdminClient();
  const start = Date.now();

  const [welfare, loan] = await Promise.all([
    processTable(admin, "welfare_programs"),
    processTable(admin, "loan_programs"),
  ]);

  const duration = Date.now() - start;

  // 1회 실행 통계 audit
  try {
    await logAdminAction({
      actorId: null,
      action: "category_backfill_run",
      details: {
        welfare,
        loan,
        duration_ms: duration,
      },
    });
  } catch (e) {
    console.warn("[category-backfill] audit 실패:", e);
  }

  return NextResponse.json({
    ok: true,
    welfare,
    loan,
    duration_ms: duration,
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
