// ============================================================
// C1 — Facebook Page 게시 (Graph API).
// ============================================================
// POST /{page-id}/feed — Page Access Token 으로 message + link.
// env: FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN

import { validateCaption } from "../validate-caption";

const GRAPH_API_VERSION = "v18.0";

export type SnsResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string };

export async function publishFacebookPost(opts: {
  message: string;
  link?: string;
}): Promise<SnsResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 5/22: AI 티 자동 차단 — 위반 시 ok:false (다른 채널 진행 보호)
  const validation = validateCaption(opts.message, {
    source: "facebook",
    warnOnly: true,
  });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `caption_violations: ${validation.violations.slice(0, 3).join("; ")}`,
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(pageId)}/feed`;
  const params = new URLSearchParams({
    message: opts.message,
    access_token: accessToken,
  });
  if (opts.link) params.set("link", opts.link);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (e) {
    return { ok: false, reason: `network: ${(e as Error).message.slice(0, 60)}` };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, reason: `http_${res.status}: ${errText.slice(0, 100)}` };
  }

  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: data?.id };
}
