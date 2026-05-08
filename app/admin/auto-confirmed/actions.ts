"use server";

// ============================================================
// /admin/auto-confirmed server actions — 회수 / 복원 / 일괄 회수
// ============================================================
// 권한: isAdminUser 가드 (이메일 기반). 비로그인·일반 사용자는 throw.
// 회수/복원 본체 로직은 lib/press-ingest/candidates.ts 의 server fn 재사용.
// 액션 후 revalidatePath 로 페이지 즉시 갱신 (Next.js 캐시 invalidation).
// ============================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  revokeAutoConfirmed,
  restoreAutoConfirmed,
} from "@/lib/press-ingest/candidates";

// 모든 액션 공통 권한 가드 — auth user + admin email 확인
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) throw new Error("권한 없음");
  return user;
}

// 단건 회수 — is_hidden=true + candidate status='revoked'
export async function revokeAction(candidateId: string) {
  const user = await requireAdmin();
  const result = await revokeAutoConfirmed({ candidateId, actorId: user.id });
  revalidatePath("/admin/auto-confirmed");
  // user detail 페이지도 즉시 갱신 — RLS 가 차단해 notFound 트리거하도록
  // (page.tsx 의 revalidate=3600 ISR 캐시 stale 방지)
  const slug = result.table === "welfare_programs" ? "welfare" : "loan";
  revalidatePath(`/${slug}/${result.programId}`);
  return result;
}

// 단건 복원 — is_hidden=false + candidate status='confirmed'
export async function restoreAction(candidateId: string) {
  const user = await requireAdmin();
  const result = await restoreAutoConfirmed({ candidateId, actorId: user.id });
  revalidatePath("/admin/auto-confirmed");
  // user detail 페이지도 즉시 갱신 — 복원된 row 가 ISR 캐시 stale 로 안 보이는 사고 방지
  const slug = result.table === "welfare_programs" ? "welfare" : "loan";
  revalidatePath(`/${slug}/${result.programId}`);
  return result;
}

// 일괄 회수 — 선택된 후보 모두 순차 회수.
// 한 건 실패해도 나머지 진행 (per-row try/catch). UI 는 결과 배열로 부분 실패 표시 가능.
export async function bulkRevokeAction(candidateIds: string[]) {
  const user = await requireAdmin();
  const results: {
    id: string;
    ok: boolean;
    error?: string;
    table?: "welfare_programs" | "loan_programs";
    programId?: string;
  }[] = [];
  for (const id of candidateIds) {
    try {
      const r = await revokeAutoConfirmed({ candidateId: id, actorId: user.id });
      results.push({ id, ok: true, table: r.table, programId: r.programId });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  revalidatePath("/admin/auto-confirmed");
  // 회수 성공한 row 들의 user detail 페이지도 revalidate
  // (per-row revalidate 보다 한 loop 끝에 모아 호출하는게 효율적)
  for (const r of results) {
    if (r.ok && r.table && r.programId) {
      const slug = r.table === "welfare_programs" ? "welfare" : "loan";
      revalidatePath(`/${slug}/${r.programId}`);
    }
  }
  return results;
}
