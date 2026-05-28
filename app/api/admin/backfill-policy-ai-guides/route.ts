// ============================================================
// 정책 상세 자체 가치 박스 백필 — 사장님 수동 trigger
// ============================================================
// ai_tips/ai_faq/ai_checklist 중 하나라도 NULL 인 row 만 대상 (idempotent).
// limit 파라미터로 sample 검수 (예: limit=10) 후 전체 백필.
// ============================================================

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePolicyGuide } from "@/lib/policy/ai-guide";

export const maxDuration = 60;

type PolicyRow = {
  id: string;
  title: string;
  // welfare_programs 에는 summary 컬럼이 없어 description 을 요약 입력으로 사용.
  description: string | null;
  category: string | null;
  target: string | null;
};

async function backfillTable(
  table: "welfare_programs" | "loan_programs",
  limit: number,
): Promise<{ table: string; updated: number; skipped: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("id, title, description, category, target")
    .or("ai_tips.is.null,ai_faq.is.null,ai_checklist.is.null")
    .limit(limit);

  if (error || !data) return { table, updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;
  // 4건씩 직렬 chunk — OpenAI rate limit 마진.
  const CHUNK = 4;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK) as PolicyRow[];
    await Promise.all(
      chunk.map(async (row) => {
        const guide = await generatePolicyGuide({
          title: row.title,
          summary: row.description ? row.description.slice(0, 200) : null,
          category: row.category,
          target: row.target,
        });
        if (!guide.tips && !guide.faq && !guide.checklist) {
          skipped += 1;
          return;
        }
        const { error: upErr } = await admin
          .from(table)
          .update({
            ai_tips: guide.tips,
            ai_faq: guide.faq,
            ai_checklist: guide.checklist,
          })
          .eq("id", row.id);
        if (upErr) skipped += 1;
        else updated += 1;
      }),
    );
  }
  return { table, updated, skipped };
}

export async function POST(req: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type === "welfare" || body.type === "loan" ? body.type : "both";
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 2000);

  const result: Record<string, unknown> = { ok: true };
  if (type === "welfare" || type === "both") {
    result.welfare = await backfillTable("welfare_programs", limit);
  }
  if (type === "loan" || type === "both") {
    result.loan = await backfillTable("loan_programs", limit);
  }
  return NextResponse.json(result);
}
