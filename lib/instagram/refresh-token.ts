// ============================================================
// 인스타 Long-Lived Access Token 자동 갱신 (60일 만료 방지)
// ============================================================
// Graph API spec: long-lived token 은 60일 만료. 만료 전 (보통 60일 내) refresh 호출하면
// 다시 60일 연장. cron 으로 매월 1일 자동 호출 → 영구 가동.
//
// 실패 시 health-alert 텔레그램/이메일.
// ============================================================

const REFRESH_ENDPOINT = "https://graph.instagram.com/refresh_access_token";

export async function refreshInstagramToken(): Promise<{
  ok: boolean;
  newToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "INSTAGRAM_ACCESS_TOKEN 누락" };

  try {
    const url = `${REFRESH_ENDPOINT}?grant_type=ig_refresh_token&access_token=${token}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message: string };
    };

    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        error: json.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      newToken: json.access_token,
      expiresIn: json.expires_in,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
