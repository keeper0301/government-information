const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_GRAPH_URL = "https://graph.threads.net";

function requiredEnv(name: "THREADS_APP_ID" | "THREADS_APP_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

export function buildThreadsAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv("THREADS_APP_ID"),
    redirect_uri: redirectUri,
    scope: [
      "threads_basic",
      "threads_content_publish",
      "threads_read_replies",
      "threads_manage_replies",
      "threads_manage_insights",
    ].join(","),
    response_type: "code",
    state,
  });
  return `${THREADS_AUTH_URL}?${params.toString()}`;
}

async function graphJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || body.error) {
    throw new Error(`threads_oauth_${body.error?.code ?? response.status}:${body.error?.message ?? "request_failed"}`);
  }
  return body;
}

export async function exchangeThreadsCode(code: string, redirectUri: string): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: requiredEnv("THREADS_APP_ID"),
    client_secret: requiredEnv("THREADS_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const short = await graphJson<{ access_token: string; user_id: string }>(`${THREADS_GRAPH_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return { accessToken: short.access_token, userId: short.user_id };
}

export async function exchangeThreadsLongToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: requiredEnv("THREADS_APP_SECRET"),
    access_token: shortToken,
  });
  const result = await graphJson<{ access_token: string; expires_in: number }>(`${THREADS_GRAPH_URL}/access_token?${params}`);
  return { accessToken: result.access_token, expiresIn: result.expires_in };
}

export async function getThreadsUser(accessToken: string): Promise<{ id: string; username: string }> {
  const params = new URLSearchParams({ fields: "id,username", access_token: accessToken });
  return graphJson<{ id: string; username: string }>(`${THREADS_GRAPH_URL}/v1.0/me?${params}`);
}
