import crypto from "node:crypto";

export type SnsCredentialCheck = {
  channel: "twitter" | "facebook" | "threads";
  ready: boolean;
  checked: boolean;
  ok: boolean;
  missing: string[];
  reason: string | null;
  httpStatus?: number;
};

export type SnsCredentialCheckSummary = {
  ok: boolean;
  checkedAt: string;
  checks: SnsCredentialCheck[];
};

const TWITTER_ENDPOINT = "https://api.twitter.com/2/users/me";
const FACEBOOK_GRAPH_VERSION = "v18.0";
const THREADS_ENDPOINT = "https://graph.threads.net/v1.0/me";

function missingEnv(keys: string[]): string[] {
  return keys.filter((key) => !process.env[key]);
}

function normalizeProviderError(
  channel: SnsCredentialCheck["channel"],
  status: number,
  body: string,
): string {
  const lower = body.toLowerCase();
  if (channel === "threads" && (lower.includes("failed to decrypt") || lower.includes('"code":190'))) {
    return "invalid_token_code_190_failed_to_decrypt";
  }
  if (lower.includes("oauth")) return `oauth_${status}: ${body.slice(0, 100)}`;
  if (lower.includes("permission") || lower.includes("permissions")) {
    return `permission_${status}: ${body.slice(0, 100)}`;
  }
  return `http_${status}: ${body.slice(0, 100)}`;
}

export async function checkTwitterCredentials(): Promise<SnsCredentialCheck> {
  const required = [
    "TWITTER_API_KEY",
    "TWITTER_API_SECRET",
    "TWITTER_ACCESS_TOKEN",
    "TWITTER_ACCESS_TOKEN_SECRET",
  ];
  const missing = missingEnv(required);
  if (missing.length > 0) {
    return { channel: "twitter", ready: false, checked: false, ok: false, missing, reason: "missing_credentials" };
  }

  const authorization = buildOAuth1Header({
    method: "GET",
    url: TWITTER_ENDPOINT,
    apiKey: process.env.TWITTER_API_KEY!,
    apiSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  });

  try {
    const res = await fetch(TWITTER_ENDPOINT, { headers: { authorization } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        channel: "twitter",
        ready: true,
        checked: true,
        ok: false,
        missing: [],
        httpStatus: res.status,
        reason: normalizeProviderError("twitter", res.status, body),
      };
    }
    return { channel: "twitter", ready: true, checked: true, ok: true, missing: [], reason: null, httpStatus: res.status };
  } catch (error) {
    return {
      channel: "twitter",
      ready: true,
      checked: true,
      ok: false,
      missing: [],
      reason: `network: ${(error as Error).message.slice(0, 80)}`,
    };
  }
}

export async function checkFacebookCredentials(): Promise<SnsCredentialCheck> {
  const required = ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"];
  const missing = missingEnv(required);
  if (missing.length > 0) {
    return { channel: "facebook", ready: false, checked: false, ok: false, missing, reason: "missing_credentials" };
  }

  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
  return checkGraphGet("facebook", url);
}

export async function checkThreadsCredentials(): Promise<SnsCredentialCheck> {
  const required = ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"];
  const missing = missingEnv(required);
  if (missing.length > 0) {
    return { channel: "threads", ready: false, checked: false, ok: false, missing, reason: "missing_credentials" };
  }

  const token = process.env.THREADS_ACCESS_TOKEN!;
  const url = `${THREADS_ENDPOINT}?fields=id,username&access_token=${encodeURIComponent(token)}`;
  return checkGraphGet("threads", url);
}

async function checkGraphGet(
  channel: "facebook" | "threads",
  url: string,
): Promise<SnsCredentialCheck> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        channel,
        ready: true,
        checked: true,
        ok: false,
        missing: [],
        httpStatus: res.status,
        reason: normalizeProviderError(channel, res.status, body),
      };
    }
    return { channel, ready: true, checked: true, ok: true, missing: [], reason: null, httpStatus: res.status };
  } catch (error) {
    return {
      channel,
      ready: true,
      checked: true,
      ok: false,
      missing: [],
      reason: `network: ${(error as Error).message.slice(0, 80)}`,
    };
  }
}

export async function checkSnsCredentials(): Promise<SnsCredentialCheckSummary> {
  const checks = await Promise.all([
    checkTwitterCredentials(),
    checkFacebookCredentials(),
    checkThreadsCredentials(),
  ]);
  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

function buildOAuth1Header(opts: {
  method: string;
  url: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}): string {
  const params: Record<string, string> = {
    oauth_consumer_key: opts.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: opts.accessToken,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join("&");
  const baseString = [opts.method.toUpperCase(), rfc3986(opts.url), rfc3986(paramString)].join("&");
  const signingKey = `${rfc3986(opts.apiSecret)}&${rfc3986(opts.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  const headerParams: Record<string, string> = { ...params, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((key) => `${rfc3986(key)}="${rfc3986(headerParams[key])}"`)
      .join(", ")
  );
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}
