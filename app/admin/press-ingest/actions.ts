"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import {
  confirmPressCandidate,
  rejectPressCandidate,
} from "@/lib/press-ingest/candidates";

async function requireAdminUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    throw new Error("권한 없음");
  }
  return user.id;
}

function getCandidateId(formData: FormData): string {
  const candidateId = formData.get("candidate_id");
  if (typeof candidateId !== "string" || candidateId.length === 0) {
    throw new Error("candidate_id 누락");
  }
  return candidateId;
}

export async function confirmPressCandidateAction(formData: FormData) {
  const actorId = await requireAdminUserId();
  const candidateId = getCandidateId(formData);
  const result = await confirmPressCandidate(candidateId, actorId);
  revalidatePath("/admin/press-ingest");
  redirect(result.table === "welfare_programs" ? `/welfare/${result.id}` : `/loan/${result.id}`);
}

export async function rejectPressCandidateAction(formData: FormData) {
  const actorId = await requireAdminUserId();
  const candidateId = getCandidateId(formData);
  await rejectPressCandidate(candidateId, actorId);
  revalidatePath("/admin/press-ingest");
  redirect("/admin/press-ingest?ok=후보를 해제했어요");
}
