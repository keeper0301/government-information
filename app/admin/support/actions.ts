// /admin/support server action — 답변 저장 + status='replied' 변경.
// admin 가드 + audit 로그.

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";

interface SubmitInput {
  ticketId: string;
  reply: string;
}

export async function submitSupportReply(
  input: SubmitInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.ticketId || !input.reply || input.reply.length < 10) {
    return { ok: false, error: "invalid_input" };
  }
  if (input.reply.length > 2000) {
    return { ok: false, error: "reply_too_long" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!isAdminUser(user.email)) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update({
      reply: input.reply,
      replied_by: user.id,
      replied_at: new Date().toISOString(),
      status: "replied",
    })
    .eq("id", input.ticketId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // 향후: 사용자 이메일로 답변 발송 (Resend) — Phase 4-B sub-spec
  // 현재는 admin 큐 update 만. 사용자가 다음 방문 시 /support/my 에서 확인 가능 (별도 spec).

  return { ok: true };
}
