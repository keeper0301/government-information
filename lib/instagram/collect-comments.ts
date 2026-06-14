// ============================================================
// IG 댓글 수집 + AI 초안 오케스트레이션 (cron · 어드민 "지금 수집" 공용)
// ============================================================
// cron(/api/cron/instagram-comment-drafts) 과 어드민 수동 버튼이 같은 로직을 쓰도록
// 분리. 토큰 로드 → 최근 댓글 수집 → 신규만 → AI 초안 → pending 저장.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import { loadValidToken } from "@/lib/instagram/oauth";
import { collectRecentComments } from "@/lib/instagram/comments";
import { generateCommentReplyDraft } from "@/lib/instagram/comment-reply-draft";
import {
  existingCommentIds,
  insertDrafts,
  type NewCommentRow,
} from "@/lib/instagram/comment-queue";

type Admin = ReturnType<typeof createAdminClient>;

export type CollectResult =
  | { ok: true; skipped: string }
  | { ok: true; collected: number; new: number; inserted: number; draftFailed: number }
  | { ok: false; error: string };

// 한 run 신규 댓글 처리 상한(LLM 비용·timeout 가드). 초과분은 다음 run.
const NEW_CAP = 20;
const CHUNK = 5;

export async function collectAndDraftComments(admin: Admin): Promise<CollectResult> {
  const tokenInfo = await loadValidToken(admin);
  if (!tokenInfo) return { ok: true, skipped: "IG 토큰 없음/만료" };

  let comments;
  try {
    comments = await collectRecentComments(tokenInfo.token, tokenInfo.userId);
  } catch (e) {
    console.error("[ig-comment-collect] 댓글 수집 실패:", (e as Error).message);
    return { ok: false, error: "댓글 수집 실패" };
  }

  const known = await existingCommentIds(admin, comments.map((c) => c.commentId));
  const fresh = comments.filter((c) => !known.has(c.commentId)).slice(0, NEW_CAP);
  if (fresh.length === 0) {
    return { ok: true, collected: comments.length, new: 0, inserted: 0, draftFailed: 0 };
  }

  const rows: NewCommentRow[] = [];
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK);
    const drafts = await Promise.all(
      chunk.map((c) =>
        generateCommentReplyDraft({ commentText: c.text, commenterUsername: c.username }),
      ),
    );
    chunk.forEach((c, j) => {
      rows.push({
        comment_id: c.commentId,
        media_id: c.mediaId,
        commenter_username: c.username,
        comment_text: c.text,
        comment_at: c.timestamp,
        draft_reply: drafts[j].draft,
      });
    });
  }

  const inserted = await insertDrafts(admin, rows);
  return {
    ok: true,
    collected: comments.length,
    new: fresh.length,
    inserted,
    draftFailed: rows.filter((r) => r.draft_reply === null).length,
  };
}
