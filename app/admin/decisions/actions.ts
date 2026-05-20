"use server";

// ============================================================
// /admin/decisions server actions — 사장님 결정 처리 (2026-05-22)
// ============================================================
// 텔레그램 /decide 명령 외 웹 UI 진입점. handleDecisionAction 재사용.
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { handleDecisionAction } from "@/lib/sms/decision-router";

async function requireAdmin(): Promise<{ email: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isAdminUser(user.email)) return null;
  return { email: user.email ?? "(unknown)" };
}

export async function approveDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/decisions?error=missing_id");

  const admin = await requireAdmin();
  if (!admin) redirect("/admin/decisions?error=unauthorized");

  const r = await handleDecisionAction({
    id,
    result: "approve",
    sender: `web:${admin.email}`,
  });
  if (!r.ok) redirect(`/admin/decisions?error=${r.reason}`);
  redirect(`/admin/decisions?ok=approve_${r.kind}`);
}

export async function rejectDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/decisions?error=missing_id");

  const admin = await requireAdmin();
  if (!admin) redirect("/admin/decisions?error=unauthorized");

  const r = await handleDecisionAction({
    id,
    result: "reject",
    sender: `web:${admin.email}`,
  });
  if (!r.ok) redirect(`/admin/decisions?error=${r.reason}`);
  redirect(`/admin/decisions?ok=reject_${r.kind}`);
}

export async function consultDecisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/decisions?error=missing_id");

  const admin = await requireAdmin();
  if (!admin) redirect("/admin/decisions?error=unauthorized");

  const r = await handleDecisionAction({
    id,
    result: "consult",
    sender: `web:${admin.email}`,
  });
  if (!r.ok) redirect(`/admin/decisions?error=${r.reason}`);
  redirect(`/admin/decisions?ok=consult_${r.kind}`);
}
