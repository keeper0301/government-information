// ============================================================
// /api/push/subscribe — 사용자 PWA 푸시 구독 등록
// ============================================================
// 2026-05-19 spec. frontend 가 PushManager.subscribe() 후 POST.
// body: { endpoint, keys: { p256dh, auth } }
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subscribeUser } from "@/lib/push/subscribe";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    user_agent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: "endpoint + keys (p256dh, auth) 필수" },
      { status: 400 },
    );
  }

  // 로그인 사용자 (선택) — 사용자별 발송용
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // 비로그인 OK — anonymous 구독
  }

  const result = await subscribeUser({
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth_key: body.keys.auth,
    user_agent: body.user_agent,
    user_id: userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
