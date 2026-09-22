import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeThreadsCode, exchangeThreadsLongToken, getThreadsUser } from "@/lib/threads/oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "threads_oauth_state";

function validSignedState(state: string): boolean {
  const secret = process.env.CRON_SECRET;
  const [prefix, timestamp, signature] = state.split(".");
  if (!secret || prefix !== "threads-insights" || !timestamp || !signature) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${prefix}.${timestamp}`).digest("hex");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
}

function resultPage(title: string, message: string, ok: boolean, status = 200): NextResponse {
  const safe = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  return new NextResponse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safe(title)}</title><style>body{font-family:system-ui,sans-serif;background:#f5f7fb;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:560px;background:#fff;padding:32px;border-radius:18px;box-shadow:0 12px 40px #0001}h1{color:${ok ? "#15803d" : "#b91c1c"}}p{line-height:1.7}</style><main class="card"><h1>${safe(title)}</h1><p>${safe(message)}</p><p>이 창을 닫고 키피오봇으로 돌아가세요.</p></main></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return resultPage("Threads 연결 취소", oauthError, false, 400);
  if (!code || !state) return resultPage("Threads 연결 오류", "인증 코드 또는 상태값이 없습니다. 연결을 다시 시작하세요.", false, 400);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if ((!expectedState || state !== expectedState) && !validSignedState(state)) {
    return resultPage("Threads 연결 오류", "보안 상태값이 일치하지 않습니다. 10분 안에 연결을 다시 시작하세요.", false, 400);
  }
  cookieStore.delete(STATE_COOKIE);

  try {
    const redirectUri = `${siteUrl()}/api/threads/oauth/callback`;
    const short = await exchangeThreadsCode(code, redirectUri);
    const long = await exchangeThreadsLongToken(short.accessToken);
    const user = await getThreadsUser(long.accessToken);
    const expiresAt = new Date(Date.now() + long.expiresIn * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await (admin as any).from("sidecar_state").insert({
      bucket: "threads-oauth-token",
      payload: {
        threads_user_id: user.id || short.userId,
        username: user.username,
        access_token: long.accessToken,
        scopes: ["threads_basic", "threads_content_publish", "threads_read_replies", "threads_manage_replies", "threads_manage_insights"],
        expires_at: expiresAt,
      },
    });
    if (error) throw new Error(`threads_token_store_failed:${error.message}`);
    return resultPage("Threads 인사이트 연결 완료", `${user.username} 계정에 threads_manage_insights 권한이 연결됐습니다.`, true);
  } catch (error) {
    console.error("[threads-oauth-callback] failed", error instanceof Error ? error.message : "unknown");
    return resultPage("Threads 연결 실패", error instanceof Error ? error.message : "unknown", false, 500);
  }
}
