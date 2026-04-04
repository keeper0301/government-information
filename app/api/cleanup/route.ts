import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RETENTION_DAYS = 180; // 6개월
const BATCH_SIZE = 100;

async function deleteAlarmsBatch(
  supabase: ReturnType<typeof createAdminClient>,
  programType: "welfare" | "loan",
  ids: string[],
) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { count } = await supabase
      .from("alarm_subscriptions")
      .delete({ count: "exact" })
      .eq("program_type", programType)
      .in("program_id", batch);
    deleted += count || 0;
  }
  return deleted;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // 만료 프로그램 ID 조회 (alarm 삭제용)
  const [{ data: expiredWelfare }, { data: expiredLoans }] = await Promise.all([
    supabase.from("welfare_programs").select("id").lt("apply_end", cutoff),
    supabase.from("loan_programs").select("id").lt("apply_end", cutoff),
  ]);

  const welfareIds = (expiredWelfare || []).map((r) => r.id);
  const loanIds = (expiredLoans || []).map((r) => r.id);

  // 관련 alarm_subscriptions 먼저 삭제 (배치 처리)
  const [alarmsW, alarmsL] = await Promise.all([
    deleteAlarmsBatch(supabase, "welfare", welfareIds),
    deleteAlarmsBatch(supabase, "loan", loanIds),
  ]);

  // 프로그램 직접 조건으로 삭제
  const [{ count: welfareDeleted }, { count: loansDeleted }] = await Promise.all([
    supabase.from("welfare_programs").delete({ count: "exact" }).lt("apply_end", cutoff),
    supabase.from("loan_programs").delete({ count: "exact" }).lt("apply_end", cutoff),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    cutoff_date: cutoff,
    welfare_deleted: welfareDeleted || 0,
    loans_deleted: loansDeleted || 0,
    alarms_deleted: alarmsW + alarmsL,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
