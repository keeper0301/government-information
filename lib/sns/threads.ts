// ============================================================
// C1 — Threads (Meta) 게시 (Threads API, 2 step container + publish).
// ============================================================
// 인스타와 비슷한 2 step 패턴.
// 1. POST /{threads-user-id}/threads → text → creation_id
// 2. POST /{threads-user-id}/threads_publish → creation_id → 게시
// env: THREADS_USER_ID / THREADS_ACCESS_TOKEN
// 텍스트 500자 제한.

import { validateCaption } from "../validate-caption";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

function normalizeThreadsError(
  stage: "create" | "publish",
  status: number,
  body: string,
): string {
  const lower = body.toLowerCase();
  if (
    status === 400 &&
    (lower.includes("failed to decrypt") || lower.includes('"code":190'))
  ) {
    return `${stage}_invalid_token_code_190_failed_to_decrypt`;
  }
  if (lower.includes("oauth")) {
    return `${stage}_oauth_${status}: ${body.slice(0, 80)}`;
  }
  return `${stage}_http_${status}: ${body.slice(0, 100)}`;
}

export type SnsResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string };

export async function publishThreadsPost(opts: {
  text: string;
}): Promise<SnsResult> {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !accessToken) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  // 5/22: AI 티 자동 차단 (사장님 5/22 명시 신뢰도 보호)
  // 위반 시 ok:false 로 반환 (throw X — dispatch 의 다른 채널 진행 보호)
  const validation = validateCaption(opts.text, {
    source: "threads",
    warnOnly: true,
    requireSubstance: true,
  });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `caption_violations: ${validation.violations.slice(0, 3).join("; ")}`,
    };
  }

  // Step 1: container 생성 (text 만 — 500자 cap)
  const createUrl = `${THREADS_API_BASE}/${encodeURIComponent(userId)}/threads`;
  const createParams = new URLSearchParams({
    media_type: "TEXT",
    text: opts.text.slice(0, 500),
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
    return {
      ok: false,
      reason: normalizeThreadsError("create", createRes.status, errText),
    };
  }
  const createData = (await createRes.json().catch(() => null)) as
    | { id?: string }
    | null;
  const creationId = createData?.id;
  if (!creationId) return { ok: false, reason: "no_creation_id" };

  // Step 2: 게시
  const publishUrl = `${THREADS_API_BASE}/${encodeURIComponent(userId)}/threads_publish`;
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
    return {
      ok: false,
      reason: normalizeThreadsError("publish", publishRes.status, errText),
    };
  }
  const publishData = (await publishRes.json().catch(() => null)) as
    | { id?: string }
    | null;
  if (!publishData?.id) return { ok: false, reason: "no_publish_id" };
  return { ok: true, id: publishData.id };
}
