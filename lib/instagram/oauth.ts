// ============================================================
// Instagram Login API OAuth 헬퍼
// ============================================================
// 표준 흐름:
//   1. authorize URL → 사용자 동의 → callback?code=XXX
//   2. code → short-lived token (1hr)
//   3. short → long-lived (60일)
//   4. 60일 만료 7일 전 refresh → 60일 연장
//
// 참고: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
// ============================================================

type OAuthConfig = {
  appId: string;
  appSecret: string;
};

/** env 미설정 시 null — graceful skip */
export function getOAuthConfig(): OAuthConfig | null {
  const appId = process.env.INSTAGRAM_OAUTH_APP_ID;
  const appSecret = process.env.INSTAGRAM_OAUTH_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

/** Instagram authorize URL 생성 (state 는 CSRF 방지) */
export function buildAuthorizeUrl(
  redirectUri: string,
  state: string,
): string | null {
  const cfg = getOAuthConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
    ].join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

/** code → short-lived token (1hr) */
export async function exchangeCodeForShortToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; userId: string }> {
  const cfg = getOAuthConfig();
  if (!cfg) throw new Error("INSTAGRAM_OAUTH_APP_ID/SECRET 미설정");

  const body = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`short-lived token 교환 실패 ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; user_id: number };
  return { accessToken: data.access_token, userId: String(data.user_id) };
}

/** short-lived → long-lived (60일) */
export async function exchangeShortForLongToken(
  shortToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const cfg = getOAuthConfig();
  if (!cfg) throw new Error("INSTAGRAM_OAUTH_APP_SECRET 미설정");

  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", cfg.appSecret);
  url.searchParams.set("access_token", shortToken);

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`long-lived token 교환 실패 ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** long-lived token refresh (60일 연장, 만료 7일 전부터 가능) */
export async function refreshLongLivedToken(
  longToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longToken);

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token refresh 실패 ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** 토큰으로 user info 조회 (id, username) */
export async function getInstagramUserInfo(
  accessToken: string,
): Promise<{ id: string; username: string }> {
  const url = new URL("https://graph.instagram.com/v23.0/me");
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`user info 조회 실패 ${res.status}: ${text}`);
  }

  return (await res.json()) as { id: string; username: string };
}
