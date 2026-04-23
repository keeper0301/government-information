import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentMinAllowedYear, isOutdatedByTitle } from "@/lib/utils";
import { notifyCronFailure } from "@/lib/email";

const RETENTION_DAYS = 180; // 6개월 (만료 후 이 일수 이상 지난 공고만 삭제)
const BATCH_SIZE = 100;
// Supabase/PostgREST 기본 1000행 제한을 넘기기 위한 한계값
// (실제로 이 이상일 일은 드물지만 안전 마진)
const MAX_ROWS = 10000;

type AdminClient = ReturnType<typeof createAdminClient>;

async function deleteAlarmsBatch(
  supabase: AdminClient,
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

// 제목에 옛 연도가 포함된 공고 ID 를 찾아 반환
// - DB 에서 (id, title) 전부 가져와서 JS 정규식으로 필터링
// - 수집 시 쓰는 isOutdatedByTitle 과 정확히 같은 기준 → 일관성 보장
async function findOldTitledIds(
  supabase: AdminClient,
  table: "welfare_programs" | "loan_programs",
  minYear: number,
): Promise<string[]> {
  const { data } = await supabase
    .from(table)
    .select("id, title")
    .range(0, MAX_ROWS - 1);

  return (data || [])
    .filter((row) => row.title && isOutdatedByTitle(row.title, minYear))
    .map((row) => row.id);
}

// 핵심 청소 로직 (POST/GET 공용)
async function runCleanup() {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const minYear = currentMinAllowedYear();

  // ━━━ 1단계: 만료 공고 ID 조회 (apply_end < cutoff) ━━━
  const [{ data: expiredWelfare }, { data: expiredLoans }] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("id")
      .lt("apply_end", cutoff)
      .range(0, MAX_ROWS - 1),
    supabase
      .from("loan_programs")
      .select("id")
      .lt("apply_end", cutoff)
      .range(0, MAX_ROWS - 1),
  ]);

  // ━━━ 2단계: 제목에 옛 연도 있는 공고 ID 조회 (apply_end 관계없이) ━━━
  // "2024 부처" 처럼 '년'이 안 붙은 패턴까지 잡기 위해 JS 정규식으로 필터링
  const [oldWelfareIds, oldLoanIds] = await Promise.all([
    findOldTitledIds(supabase, "welfare_programs", minYear),
    findOldTitledIds(supabase, "loan_programs", minYear),
  ]);

  // 두 조건 합집합 (중복 제거)
  const welfareIds = Array.from(
    new Set([
      ...(expiredWelfare || []).map((r) => r.id),
      ...oldWelfareIds,
    ]),
  );
  const loanIds = Array.from(
    new Set([
      ...(expiredLoans || []).map((r) => r.id),
      ...oldLoanIds,
    ]),
  );

  // ━━━ 3단계: 관련 alarm_subscriptions 먼저 삭제 (FK 정리) ━━━
  const [alarmsW, alarmsL] = await Promise.all([
    deleteAlarmsBatch(supabase, "welfare", welfareIds),
    deleteAlarmsBatch(supabase, "loan", loanIds),
  ]);

  // ━━━ 4단계: 실제 프로그램 삭제 ━━━
  // ID 목록이 크면 in() 이 실패할 수 있어서 배치로 나눔
  async function deleteByIds(table: "welfare_programs" | "loan_programs", ids: string[]) {
    let total = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const { count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .in("id", batch);
      total += count || 0;
    }
    return total;
  }

  const [welfareDeleted, loansDeleted] = await Promise.all([
    deleteByIds("welfare_programs", welfareIds),
    deleteByIds("loan_programs", loanIds),
  ]);

  return {
    timestamp: new Date().toISOString(),
    cutoff_date: cutoff,
    min_year: minYear,
    welfare_deleted: welfareDeleted,
    loans_deleted: loansDeleted,
    alarms_deleted: alarmsW + alarmsL,
  };
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runCleanupAndRespond(jobLabel: string) {
  try {
    const result = await runCleanup();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    await notifyCronFailure(jobLabel, message);
    return NextResponse.json({ error: "정리 실패", detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return runCleanupAndRespond("cleanup (POST)");
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;
  return runCleanupAndRespond("cleanup (cron)");
}
