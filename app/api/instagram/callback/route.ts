// ============================================================
// /api/instagram/callback — Instagram OAuth redirect 처리
// ============================================================
// Instagram 이 GET /api/instagram/callback?code=XXX&state=YYY 로 redirect.
//
// 1) state cookie 검증 (CSRF)
// 2) code → short-lived token (1hr)
// 3) short → long-lived (60일)
// 4) user info (id, username) 조회
// 5) instagram_oauth_tokens upsert
// 6) /admin/instagram?oauth=success&user=USERNAME 으로 redirect
//
// 에러 시 /admin/instagram?oauth_error=... 으로 redirect — 어드민 UI 가
// query param 보고 사장님께 에러 메시지 표시.
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForShortToken,
  exchangeShortForLongToken,
  getInstagramUserInfo,
} from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "ig_oauth_state";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.keepioo.com";
}

function adminRedirect(query: string): NextResponse {
  return NextResponse.redirect(`${siteUrl()}/admin/instagram?${query}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // 사용자가 동의 거부 → 인스타가 ?error=access_denied 등으로 redirect
  if (errorParam) {
    return adminRedirect(`oauth_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !state) {
    return adminRedirect("oauth_error=missing_params");
  }

  // CSRF state 검증
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return adminRedirect("oauth_error=state_mismatch");
  }
  cookieStore.delete(STATE_COOKIE);

  const redirectUri = `${siteUrl()}/api/instagram/callback`;

  try {
    // 1) code → short-lived (1hr)
    const short = await exchangeCodeForShortToken(code, redirectUri);

    // 2) short → long-lived (60일)
    const long = await exchangeShortForLongToken(short.accessToken);

    // 3) user info — username 표시용 + ig_user_id 재확인
    const userInfo = await getInstagramUserInfo(long.accessToken);

    // 4) DB upsert
    const expiresAt = new Date(Date.now() + long.expiresIn * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin
      .from("instagram_oauth_tokens")
      .upsert(
        {
          ig_user_id: userInfo.id,
          access_token: long.accessToken,
          expires_at: expiresAt,
          refreshed_at: null,
          username: userInfo.username,
        },
        { onConflict: "ig_user_id" },
      );

    if (error) {
      console.error("[instagram-callback] DB upsert 실패:", error);
      return adminRedirect(
        `oauth_error=db_${encodeURIComponent(error.message)}`,
      );
    }

    return adminRedirect(
      `oauth=success&user=${encodeURIComponent(userInfo.username)}`,
    );
  } catch (e) {
    console.error("[instagram-callback] OAuth flow 실패:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return adminRedirect(`oauth_error=${encodeURIComponent(msg)}`);
  }
}
