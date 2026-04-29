// ============================================================
// /admin/dedupe — 중복 정책 후보 confirm / reject server actions
// ============================================================
// cron(/api/dedupe-detect) 가 score ≥ 0.7 페어를 duplicate_of_id 에 임시 저장.
// 사장님이 사이트에서 confirm 하면 그대로 유지 (이미 저장됐으므로 noop + 감사 로그),
// reject 하면 duplicate_of_id NULL 로 reset.
//
// 사장님 외 호출 차단 (isAdminUser 가드 + service_role).
// ============================================================

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";

type TableName = "welfare_programs" | "loan_programs";
const ALLOWED_TABLES: ReadonlyArray<TableName> = [
  "welfare_programs",
  "loan_programs",
];

// 모든 admin server action 진입점 가드
async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    redirect("/login?next=/admin/dedupe");
  }
  return user;
}

// 폼에서 받은 table 값이 화이트리스트에 있는지 검증 — 임의 테이블 조작 차단
function validateTable(raw: string): TableName {
  if (!ALLOWED_TABLES.includes(raw as TableName)) {
    redirect("/admin/dedupe?error=" + encodeURIComponent("잘못된 table"));
  }
  return raw as TableName;
}

// ─── 1) 중복 확정 (duplicate_of_id 유지 + 감사 로그) ────────
// duplicate_of_id 는 cron 이 이미 채웠으므로 DB 변경 없이 감사 로그만 남기는
// "확정" 의미. 추후 정책 노출 로직이 duplicate_of_id IS NOT NULL 인 row 를
// 자동으로 가린다면, confirm 자체로는 보이는 상태가 그대로 유지됨.
export async function confirmDuplicate(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const baseId = String(formData.get("baseId") ?? "").trim();
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  const tableRaw = String(formData.get("table") ?? "").trim();

  if (!baseId || !candidateId) {
    redirect("/admin/dedupe?error=" + encodeURIComponent("ID 누락"));
  }
  const table = validateTable(tableRaw);

  // 정합성 — 현재 DB 가 baseId.duplicate_of_id == candidateId 인지 한 번 더 확인.
  // (cron 이 다른 후보로 덮어쓴 후 사장님이 stale UI 로 confirm 누른 경우 차단)
  const admin = createAdminClient();
  const { data: row, error: findErr } = await admin
    .from(table)
    .select("id, duplicate_of_id")
    .eq("id", baseId)
    .maybeSingle();

  if (findErr || !row) {
    redirect("/admin/dedupe?error=" + encodeURIComponent("row 조회 실패"));
  }
  if (row.duplicate_of_id !== candidateId) {
    redirect(
      "/admin/dedupe?error=" +
        encodeURIComponent("후보 정보가 변경되었어요 — 새로고침"),
    );
  }

  await logAdminAction({
    actorId: user.id,
    action: "dedupe_confirm",
    details: { table, baseId, candidateId },
  });

  // dedupe 후보 list 갱신
  try {
    revalidatePath("/admin/dedupe");
  } catch (e) {
    console.warn("[admin/dedupe] revalidate 실패:", e);
  }

  redirect("/admin/dedupe?ok=" + encodeURIComponent("중복 확정 완료"));
}

// ─── 2) 중복 후보 reject (duplicate_of_id NULL 로 reset + 감사 로그) ──
// 잘못 잡힌 false positive 를 사장님이 풀어주는 경로.
// 같은 페어가 다음 cron 에 재매칭되지 않도록 향후 deny-list 도입 가능 (현재는 단순 reset).
export async function rejectDuplicate(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const baseId = String(formData.get("baseId") ?? "").trim();
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  const tableRaw = String(formData.get("table") ?? "").trim();

  if (!baseId) {
    redirect("/admin/dedupe?error=" + encodeURIComponent("baseId 누락"));
  }
  const table = validateTable(tableRaw);

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from(table)
    .update({ duplicate_of_id: null })
    .eq("id", baseId);

  if (updErr) {
    redirect(
      "/admin/dedupe?error=" +
        encodeURIComponent("reset 실패: " + updErr.message),
    );
  }

  await logAdminAction({
    actorId: user.id,
    action: "dedupe_reject",
    details: { table, baseId, candidateId },
  });

  try {
    revalidatePath("/admin/dedupe");
  } catch (e) {
    console.warn("[admin/dedupe] revalidate 실패:", e);
  }

  redirect("/admin/dedupe?ok=" + encodeURIComponent("후보 해제 완료"));
}
