// ============================================================
// /api/push/subscribe — 사용자 PWA 푸시 구독 등록/해제
// ============================================================
// 2026-05-19 spec. frontend 가 PushManager.subscribe() 후 POST.
// body: { endpoint, keys: { p256dh, auth } }
//
// 2026-05-21 audit hot-fix:
//  · C1: anonymous 차단 (userId null → 401) — 전역 rate limit DoS 봉쇄
//  · C2: endpoint URL allowlist — 발송 cron 가동 시 SSRF 차단
//  · H2: DELETE 메서드 — 클라 unsubscribe 시 서버 row 즉시 삭제
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subscribeUser, removeSubscription } from "@/lib/push/subscribe";
import {
  isJsonBodyTooLargeError,
  readJsonWithLimit,
} from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const maxDuration = 10;
const MAX_PUSH_SUBSCRIPTION_BODY_BYTES = 8 * 1024;

// 발송 endpoint 화이트리스트 — Web Push 표준 4대 브라우저 push service.
// SSRF 방지: 클라가 임의 URL 등록 후 발송 cron 이 그 URL 로 POST 하는 위험 차단.
const ALLOWED_PUSH_HOSTS = new Set<string>([
  "fcm.googleapis.com",          // Chrome / Android / Edge (이전)
  "android.googleapis.com",       // 구 Chrome
]);
const ALLOWED_PUSH_SUFFIXES = [
  ".notify.windows.com",          // Edge / Windows Push
  ".push.services.mozilla.com",   // Firefox
  ".web.push.apple.com",          // Safari / iOS PWA
];

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    if (ALLOWED_PUSH_HOSTS.has(u.hostname)) return true;
    return ALLOWED_PUSH_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch {
    return false;
  }
}

// base64-url-safe 형식 검증 — 발송 cron crash 방지.
const BASE64_URL = /^[A-Za-z0-9_-]+=*$/;

export async function POST(request: Request) {
  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    user_agent?: string;
  };
  try {
    body = await readJsonWithLimit(request, MAX_PUSH_SUBSCRIPTION_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: "endpoint + keys (p256dh, auth) 필수" },
      { status: 400 },
    );
  }

  // C2: endpoint URL allowlist
  if (!isAllowedEndpoint(body.endpoint)) {
    return NextResponse.json(
      { error: "허용된 푸시 서비스 endpoint 가 아닙니다" },
      { status: 400 },
    );
  }

  // p256dh / auth base64-url-safe 형식 검증
  if (!BASE64_URL.test(body.keys.p256dh) || !BASE64_URL.test(body.keys.auth)) {
    return NextResponse.json(
      { error: "keys 형식 오류 (base64-url-safe)" },
      { status: 400 },
    );
  }

  // C1: anonymous 차단 — 로그인 사용자만 구독 허용.
  // 전역 rate limit DoS 차단 효과도 있음 (attacker 가 자유 등록 불가).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다" },
      { status: 401 },
    );
  }

  const result = await subscribeUser({
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth_key: body.keys.auth,
    user_agent: body.user_agent,
    user_id: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}

// H2: 사용자가 클라에서 sub.unsubscribe() 후 호출 → 서버 row 즉시 삭제.
// 발송 cron 가동 후 410/404 응답 시 같은 함수 (removeSubscription) 재사용 가능.
export async function DELETE(request: Request) {
  let body: { endpoint?: string };
  try {
    body = await readJsonWithLimit(request, MAX_PUSH_SUBSCRIPTION_BODY_BYTES);
  } catch (err) {
    return NextResponse.json(
      { error: isJsonBodyTooLargeError(err) ? "body_too_large" : "invalid body" },
      { status: isJsonBodyTooLargeError(err) ? 413 : 400 },
    );
  }

  if (!body.endpoint) {
    return NextResponse.json(
      { error: "endpoint 필수" },
      { status: 400 },
    );
  }

  // 로그인 사용자만 자기 endpoint 해제 가능 — 다른 사용자 구독 삭제 차단.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다" },
      { status: 401 },
    );
  }

  await removeSubscription(body.endpoint, user.id);
  return NextResponse.json({ ok: true });
}
