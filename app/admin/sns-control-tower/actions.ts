"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-actions";
import {
  normalizeChallengerTrafficInput,
  normalizeLeadPolicyInput,
} from "@/lib/sns-control-tower/lead-policy";
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
  return user;
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

export async function setLeadPolicyAction(formData: FormData) {
  const user = await requireAdmin();
  let policy: ReturnType<typeof normalizeLeadPolicyInput>;
  try {
    policy = normalizeLeadPolicyInput({
      content: String(formData.get("content") ?? ""),
      status: String(formData.get("status") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error instanceof Error ? error.message : "invalid_lead_policy")}`);
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "sns_lead_policy_update",
      details: policy,
    });
    revalidatePath(PATH);
  } catch (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error instanceof Error ? error.message : "lead_policy_update_failed")}`);
  }

  const label = policy.status === "paused" ? "중단" : "사용";
  redirect(`${PATH}?flash=${encodeURIComponent(`${policy.content} ${label} 정책 저장 완료`)}`);
}

export async function setChallengerTrafficAction(formData: FormData) {
  const user = await requireAdmin();
  let traffic: ReturnType<typeof normalizeChallengerTrafficInput>;
  try {
    traffic = normalizeChallengerTrafficInput({
      pct: String(formData.get("pct") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error instanceof Error ? error.message : "invalid_challenger_traffic")}`);
  }

  try {
    await logAdminAction({
      actorId: user.id,
      action: "sns_challenger_traffic_update",
      details: traffic,
    });
    revalidatePath(PATH);
  } catch (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error instanceof Error ? error.message : "challenger_traffic_update_failed")}`);
  }

  redirect(`${PATH}?flash=${encodeURIComponent(`challenger 제한 노출 ${traffic.pct}% 저장 완료`)}`);
}
