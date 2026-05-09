// ============================================================
// 텔레그램 봇용 dedupe 액션 helpers — list / confirm / reject.
// ============================================================
// /admin/dedupe 페이지의 server action 은 requireAdminUser() redirect 패턴이라
// dispatcher 에서 직접 호출 어려움. 같은 로직을 봇 친화 형태로 재구성.
//
// table 은 baseId 만으로 welfare/loan 양쪽 fetch 시도 → 발견된 쪽 사용.

import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";

type Table = "welfare_programs" | "loan_programs";

export interface DedupeBotRow {
  table: Table;
  base_id: string;
  base_title: string;
  candidate_id: string;
  candidate_title: string;
}

// 두 테이블에서 duplicate_of_id IS NOT NULL + 자동 confirm 안 된 후보 N건씩
// → 합쳐서 최신순 N건 반환.
export async function listDuplicateCandidatesForBot(
  limit = 5,
): Promise<DedupeBotRow[]> {
  const admin = createAdminClient();
  const tables: Table[] = ["welfare_programs", "loan_programs"];
  const rows: DedupeBotRow[] = [];

  for (const table of tables) {
    const { data: bases } = await admin
      .from(table)
      .select("id, title, duplicate_of_id, updated_at")
      .not("duplicate_of_id", "is", null)
      .is("dedupe_auto_confirmed_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (!bases || bases.length === 0) continue;

    const candidateIds = bases
      .map((b) => b.duplicate_of_id as string)
      .filter(Boolean);
    const { data: cands } = await admin
      .from(table)
      .select("id, title")
      .in("id", candidateIds);
    const candMap = new Map<string, string>();
    for (const c of cands ?? []) {
      candMap.set(c.id as string, (c.title as string) ?? "");
    }

    for (const b of bases) {
      rows.push({
        table,
        base_id: b.id as string,
        base_title: (b.title as string) ?? "",
        candidate_id: b.duplicate_of_id as string,
        candidate_title: candMap.get(b.duplicate_of_id as string) ?? "(미발견)",
      });
    }
  }

  // updated_at 정렬은 fetch 단계에서 이미 완료. table 합친 후 최신순 cap.
  return rows.slice(0, limit);
}

// baseId 만으로 welfare/loan 어느 쪽인지 자동 감지.
async function findBaseTable(
  admin: ReturnType<typeof createAdminClient>,
  baseId: string,
): Promise<Table | null> {
  for (const table of ["welfare_programs", "loan_programs"] as Table[]) {
    const { data } = await admin
      .from(table)
      .select("id, duplicate_of_id")
      .eq("id", baseId)
      .maybeSingle();
    if (data) return table;
  }
  return null;
}

// /dedupe confirm {baseId} — duplicate_of_id 유지 + 검수 큐 제외 마킹 + 감사 로그.
//
// dedupe_auto_confirmed_at 컬럼은 "검수 끝났음" 마커 (cron 자동 confirm 과 같은 의미).
// 사이트 /admin/dedupe 페이지 query 가 이 컬럼 IS NULL 로 큐를 거르므로 채워야
// 다음 list 호출에서 같은 row 가 무한 반복으로 보이는 일이 사라짐.
export async function confirmDuplicateForBot(baseId: string): Promise<{
  table: Table;
  candidateId: string;
}> {
  const admin = createAdminClient();
  const table = await findBaseTable(admin, baseId);
  if (!table) throw new Error("base row 를 두 테이블에서 모두 못 찾음");

  const { data: row } = await admin
    .from(table)
    .select("id, duplicate_of_id")
    .eq("id", baseId)
    .maybeSingle();
  if (!row) throw new Error("base row fetch 실패");
  if (!row.duplicate_of_id) {
    throw new Error("이미 해제된 후보 (duplicate_of_id 없음)");
  }
  const candidateId = row.duplicate_of_id as string;

  // 검수 큐에서 빼기 — duplicate_of_id 는 그대로 유지 (정책 노출 차단 의도 보존).
  const { error: updErr } = await admin
    .from(table)
    .update({ dedupe_auto_confirmed_at: new Date().toISOString() })
    .eq("id", baseId);
  if (updErr) throw new Error(`검수 큐 제외 실패: ${updErr.message}`);

  await logAdminAction({
    actorId: null,
    action: "dedupe_confirm",
    details: { table, baseId, candidateId, source: "telegram_bot" },
  });

  return { table, candidateId };
}

// /dedupe reject {baseId} — duplicate_of_id NULL reset + 감사 로그.
export async function rejectDuplicateForBot(baseId: string): Promise<{
  table: Table;
  prevCandidateId: string | null;
}> {
  const admin = createAdminClient();
  const table = await findBaseTable(admin, baseId);
  if (!table) throw new Error("base row 를 두 테이블에서 모두 못 찾음");

  const { data: row } = await admin
    .from(table)
    .select("id, duplicate_of_id")
    .eq("id", baseId)
    .maybeSingle();
  if (!row) throw new Error("base row fetch 실패");
  const prevCandidateId = (row.duplicate_of_id as string | null) ?? null;

  const { error: updErr } = await admin
    .from(table)
    .update({ duplicate_of_id: null })
    .eq("id", baseId);
  if (updErr) throw new Error(`reset 실패: ${updErr.message}`);

  await logAdminAction({
    actorId: null,
    action: "dedupe_reject",
    details: { table, baseId, candidateId: prevCandidateId, source: "telegram_bot" },
  });

  return { table, prevCandidateId };
}
