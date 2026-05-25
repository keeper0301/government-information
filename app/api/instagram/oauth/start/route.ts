// ============================================================
// /api/instagram/oauth/start — Instagram OAuth flow 시작
// ============================================================
// 어드민 (사장님) 만 접근. CSRF state cookie set 후
// Instagram authorize URL 으로 302 redirect.
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { buildAuthorizeUrl } from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "ig_oauth_state";
const STATE_MAX_AGE = 600; // 10분 — 사용자가 동의 완료할 만한 시간

export async function GET() {
  // 1) 어드민 only — 어드민 아니면 403
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 2) redirect URI 생성 (페이스북 앱에 등록한 것과 정확히 일치해야 함)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
  const redirectUri = `${siteUrl}/api/instagram/callback`;

  // 3) state — CSRF 방지용 random hex
  const state = randomBytes(24).toString("hex");

  // 4) authorize URL
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state);
  if (!authorizeUrl) {
    return NextResponse.json(
      {
        error: "env_missing",
        message:
          "INSTAGRAM_OAUTH_APP_ID 또는 INSTAGRAM_OAUTH_APP_SECRET 미설정. Vercel env 등록 필요.",
      },
      { status: 500 },
    );
  }

  // 5) state cookie set (HttpOnly + Secure + SameSite=Lax — OAuth redirect 통과)
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: STATE_MAX_AGE,
    path: "/",
  });

  // 6) Instagram authorize 페이지로 redirect
  return NextResponse.redirect(authorizeUrl);
}
