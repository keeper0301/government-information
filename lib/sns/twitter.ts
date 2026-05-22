// ============================================================
// C1 — Twitter (X) API v2 게시 helper (OAuth 1.0a).
// ============================================================
// POST /2/tweets — Bearer 안 되고 user context (OAuth 1.0a) 만 가능.
// env: TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET
// 280자 제한 (URL 23자 단축 고려).

import crypto from "node:crypto";
import { validateCaption } from "../validate-caption";

const ENDPOINT = "https://api.twitter.com/2/tweets";

export type SnsResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string };

export async function publishTweet(text: string): Promise<SnsResult> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 5/22: AI 티 자동 차단 — 위반 시 ok:false (다른 채널 진행 보호)
  const validation = validateCaption(text, { source: "twitter", warnOnly: true });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `caption_violations: ${validation.violations.slice(0, 3).join("; ")}`,
    };
  }

  const tweet = text.slice(0, 280);
  const oauthHeader = buildOAuth1Header({
    method: "POST",
    url: ENDPOINT,
    apiKey,
    apiSecret,
    accessToken,
    accessSecret,
  });

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: oauthHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweet }),
    });
  } catch (e) {
    return { ok: false, reason: `network: ${(e as Error).message.slice(0, 60)}` };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, reason: `http_${res.status}: ${errText.slice(0, 100)}` };
  }

  const data = (await res.json().catch(() => null)) as
    | { data?: { id?: string } }
    | null;
  return { ok: true, id: data?.data?.id };
}

// OAuth 1.0a HMAC-SHA1 서명 — application/json POST 는 body 가 signature 에 포함 X.
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
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");
  const baseString = [
    opts.method.toUpperCase(),
    rfc3986(opts.url),
    rfc3986(paramString),
  ].join("&");
  const signingKey = `${rfc3986(opts.apiSecret)}&${rfc3986(opts.accessSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");
  const headerParams: Record<string, string> = {
    ...params,
    oauth_signature: signature,
  };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k])}"`)
      .join(", ")
  );
}

function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
