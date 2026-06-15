"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  importLocalReportsToSnsRegistry,
  markSnsPostManuallyDeleted,
} from "@/lib/sns-control-tower/registry";

const PATH = "/admin/sns-control-tower";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) redirect(`${PATH}?error=unauthorized`);
}

export async function importLocalReportsAction() {
  await requireAdmin();
  const result = await importLocalReportsToSnsRegistry();
  revalidatePath(PATH);
  if (!result.ok) {
    const msg = result.errors.slice(0, 2).join(" | ").slice(0, 240);
    redirect(`${PATH}?error=${encodeURIComponent(msg || "import_failed")}`);
  }
  redirect(
    `${PATH}?flash=${encodeURIComponent(
      `DB 원장 이관 완료: ${result.imported}건 · 삭제큐 ${result.cleanupQueued}건`,
    )}`,
  );
}

export async function markManualDeletedAction(formData: FormData) {
  await requireAdmin();
  const mediaId = String(formData.get("mediaId") ?? "").trim();
  if (!mediaId) redirect(`${PATH}?error=missing_media_id`);

  const result = await markSnsPostManuallyDeleted(mediaId);
  revalidatePath(PATH);
  if (!result.ok) {
    redirect(`${PATH}?error=${encodeURIComponent(result.error ?? "manual_delete_update_failed")}`);
  }
  redirect(`${PATH}?flash=${encodeURIComponent(`수동 삭제 완료 표시: ${mediaId}`)}`);
}
