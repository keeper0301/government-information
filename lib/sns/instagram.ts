// ============================================================
// C1 — Instagram Business 게시 (Graph API, 2 step container + publish).
// ============================================================
// 1. POST /{ig-user-id}/media → image_url + caption → creation_id
// 2. POST /{ig-user-id}/media_publish → creation_id → 게시
// env: INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN
// 이미지 URL 필수 — blog cover_image 활용. 캡션은 한글 권장.

const GRAPH_API_VERSION = "v18.0";

export type SnsResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string };

export async function publishInstagramPost(opts: {
  imageUrl: string;
  caption: string;
}): Promise<SnsResult> {
  const userId = process.env.INSTAGRAM_USER_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !accessToken) {
    return { ok: false, reason: "skipped_no_credentials" };
  }
  if (!opts.imageUrl) {
    return { ok: false, reason: "no_image_url" };
  }

  // Step 1: container 생성
  const createUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(userId)}/media`;
  const createParams = new URLSearchParams({
    image_url: opts.imageUrl,
    caption: opts.caption.slice(0, 2200),
    access_token: accessToken,
  });

  let createRes: Response;
  try {
    createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    });
  } catch (e) {
    return { ok: false, reason: `create_network: ${(e as Error).message.slice(0, 60)}` };
  }
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    return { ok: false, reason: `create_http_${createRes.status}: ${errText.slice(0, 100)}` };
  }
  const createData = (await createRes.json().catch(() => null)) as
    | { id?: string }
    | null;
  const creationId = createData?.id;
  if (!creationId) return { ok: false, reason: "no_creation_id" };

  // Step 2: 게시
  const publishUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(userId)}/media_publish`;
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  let publishRes: Response;
  try {
    publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    });
  } catch (e) {
    return { ok: false, reason: `publish_network: ${(e as Error).message.slice(0, 60)}` };
  }
  if (!publishRes.ok) {
    const errText = await publishRes.text().catch(() => "");
    return { ok: false, reason: `publish_http_${publishRes.status}: ${errText.slice(0, 100)}` };
  }
  const publishData = (await publishRes.json().catch(() => null)) as
    | { id?: string }
    | null;
  return { ok: true, id: publishData?.id };
}
