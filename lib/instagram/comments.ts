// ============================================================
// Instagram 댓글 수집 + 답글 게시 (Graph API 래퍼)
// ============================================================
// instagram_business_manage_comments 권한 토큰(lib/instagram/oauth loadValidToken)
// 으로 최근 게시물의 댓글을 읽고, 사장님 승인된 답글을 게시한다.
// 순수 API 래퍼 — DB·LLM 의존 없음. 호출자(cron/approve action)가 조립.
// ============================================================

const GRAPH = "https://graph.instagram.com/v23.0";

// 에러 메시지에서 access_token 노출 차단(혹시 IG 응답/URL 이 에코될 경우 대비).
function maskToken(s: string): string {
  return s.replace(/access_token=[^&\s"']+/gi, "access_token=***");
}

// IG 오류 본문에서 error.message 만 추출(전문 slice 로 토큰·PII 싣지 않기). 실패 시 마스킹된 원문.
function igError(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown } };
    if (j?.error?.message) return String(j.error.message);
  } catch {
    // JSON 아님 — 아래 마스킹 fallback
  }
  return maskToken(body);
}

// 한 댓글 — 수집 결과(저장·초안 생성에 필요한 최소 필드).
export type IgComment = {
  commentId: string;
  mediaId: string;
  text: string;
  username: string | null;
  timestamp: string | null;
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IG API ${res.status}: ${igError(body).slice(0, 200)}`);
  }
  return res.json();
}

// 최근 게시물 N개의 id 조회.
async function fetchRecentMediaIds(
  token: string,
  igUserId: string,
  mediaLimit: number,
): Promise<string[]> {
  const url = `${GRAPH}/${igUserId}/media?fields=id&limit=${mediaLimit}&access_token=${encodeURIComponent(token)}`;
  const json = (await getJson(url)) as { data?: { id?: unknown }[] };
  return (json.data ?? [])
    .map((m) => (typeof m.id === "string" ? m.id : null))
    .filter((v): v is string => v !== null);
}

// 한 게시물의 댓글 조회.
async function fetchCommentsForMedia(
  token: string,
  mediaId: string,
  perMedia: number,
): Promise<IgComment[]> {
  const url = `${GRAPH}/${mediaId}/comments?fields=id,text,username,timestamp&limit=${perMedia}&access_token=${encodeURIComponent(token)}`;
  const json = (await getJson(url)) as {
    data?: { id?: unknown; text?: unknown; username?: unknown; timestamp?: unknown }[];
  };
  return (json.data ?? [])
    .filter((c) => typeof c.id === "string" && typeof c.text === "string" && (c.text as string).trim() !== "")
    .map((c) => ({
      commentId: c.id as string,
      mediaId,
      text: c.text as string,
      username: typeof c.username === "string" ? c.username : null,
      timestamp: typeof c.timestamp === "string" ? c.timestamp : null,
    }));
}

/**
 * 최근 게시물들의 댓글을 모아서 반환. mediaLimit 개 게시물 × perMedia 개 댓글.
 * 한 게시물 조회 실패는 건너뛰고 나머지 진행(전체 reject 방지).
 */
export async function collectRecentComments(
  token: string,
  igUserId: string,
  opts: { mediaLimit?: number; perMedia?: number } = {},
): Promise<IgComment[]> {
  // 상한 clamp — 호출자 실수로 과대 요청해 IG rate limit 치는 것 방어.
  const mediaLimit = Math.min(Math.max(1, opts.mediaLimit ?? 8), 50);
  const perMedia = Math.min(Math.max(1, opts.perMedia ?? 25), 100);
  const mediaIds = await fetchRecentMediaIds(token, igUserId, mediaLimit);
  const out: IgComment[] = [];
  for (const mediaId of mediaIds) {
    try {
      out.push(...(await fetchCommentsForMedia(token, mediaId, perMedia)));
    } catch (e) {
      console.warn(`[ig-comments] media ${mediaId} 댓글 조회 실패:`, (e as Error).message);
    }
  }
  return out;
}

/**
 * 한 댓글에 답글 게시. POST /{comment-id}/replies?message=...
 * 성공 시 생성된 reply id 반환.
 */
export async function postCommentReply(
  token: string,
  commentId: string,
  message: string,
): Promise<string> {
  const body = new URLSearchParams({ message, access_token: token });
  const res = await fetch(`${GRAPH}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`답글 게시 실패 ${res.status}: ${igError(text).slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: unknown };
  // id 없으면 게시 추적 불가 — 무음 "" 반환 대신 throw (호출자가 posted 오인 방지).
  if (typeof json.id !== "string" || !json.id) {
    throw new Error("답글 게시 응답에 reply id 없음 (게시 확인 불가)");
  }
  return json.id;
}
