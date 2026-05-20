"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildPolicyInboxUpsertPayload,
  type PolicyInboxAction,
} from "@/lib/notifications/policy-inbox-state";
import { createClient } from "@/lib/supabase/server";

const ACTIONS: PolicyInboxAction[] = [
  "read",
  "unread",
  "save",
  "unsave",
  "hide",
  "unhide",
];

export async function updatePolicyInboxItemState(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/mypage/notifications/history");
  }

  const action = String(formData.get("action") ?? "") as PolicyInboxAction;
  if (!ACTIONS.includes(action)) return;

  const payload = buildPolicyInboxUpsertPayload({
    userId: user.id,
    ref: {
      program_table: String(formData.get("program_table") ?? ""),
      program_id: String(formData.get("program_id") ?? ""),
    },
    action,
  });
  if (!payload) return;

  const { error } = await supabase
    .from("user_policy_inbox_items")
    .upsert(payload, {
      onConflict: "user_id,program_type,program_id",
    });

  if (error) {
    console.warn("[policy-inbox-state] update failed:", error.message);
    return;
  }

  revalidatePath("/mypage/notifications/history");
}
