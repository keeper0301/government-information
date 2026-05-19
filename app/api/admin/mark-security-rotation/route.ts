// ============================================================
// /api/admin/mark-security-rotation — 사장님 보안 회전 완료 1 click 신고
// ============================================================
// 사장님이 cgc0301! + RENDER_API_KEY 회전 완료 후 GET 한 번 호출.
// admin_actions.security_rotation_done audit insert → PendingExternalActionsCard 자동 hide.
//
// 인증: admin 로그인 (createClient + isAdminUser).
// 멱등성: 중복 insert OK (audit 누적, 추가 row 만 발생, 동작 영향 0).
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { logAdminAction, type AdminActionType } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function run() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  await logAdminAction({
    actorId: user.id,
    action: "security_rotation_done" as AdminActionType,
    details: {
      reported_at: new Date().toISOString(),
      sources: [
        "cgc0301!_chrome_paste_hijack_2026_05_18",
        "RENDER_API_KEY_revoke",
      ],
    },
  });

  return NextResponse.json({
    ok: true,
    message: "보안 회전 완료 신고. PendingExternalActionsCard 자동 hide.",
  });
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
