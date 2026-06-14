// ============================================================
// /api/cron/instagram-comment-drafts — IG 댓글 수집 + AI 답글 초안 (human-in-loop)
// ============================================================
// @keepioo_official 최근 게시물의 새 댓글을 polling 으로 수집 → AI 답글 초안 생성 →
// instagram_comment_replies 에 status='pending' 저장. 게시는 어드민 승인 후(별도).
// 토큰 미저장/OPENAI 미설정 시 graceful skip.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { loadValidToken } from "@/lib/instagram/oauth";
import { collectRecentComments } from "@/lib/instagram/comments";
import { generateCommentReplyDraft } from "@/lib/instagram/comment-reply-draft";
import {
  existingCommentIds,
  insertDrafts,
  type NewCommentRow,
} from "@/lib/instagram/comment-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 한 run 신규 댓글 처리 상한 (LLM 비용·rate limit 가드). 초과분은 다음 run.
const NEW_CAP = 20;
const CHUNK = 5;

async function run() {
  const admin = createAdminClient();

  const tokenInfo = await loadValidToken(admin);
  if (!tokenInfo) {
    return NextResponse.json({ ok: true, skipped: "IG 토큰 없음/만료" });
  }

  let comments;
  try {
    comments = await collectRecentComments(tokenInfo.token, tokenInfo.userId);
  } catch (e) {
    console.error("[ig-comment-drafts] 댓글 수집 실패:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "댓글 수집 실패" }, { status: 502 });
  }

  // 이미 큐에 있는 댓글 제외 → 신규만 (재과금 방지)
  const known = await existingCommentIds(admin, comments.map((c) => c.commentId));
  const fresh = comments.filter((c) => !known.has(c.commentId)).slice(0, NEW_CAP);
  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, collected: comments.length, new: 0 });
  }

  // 초안 생성 — CHUNK 병렬, 각 try/catch 격리(generateCommentReplyDraft 가 자체 graceful).
  const rows: NewCommentRow[] = [];
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK);
    const drafts = await Promise.all(
      chunk.map((c) =>
        generateCommentReplyDraft({
          commentText: c.text,
          commenterUsername: c.username,
        }),
      ),
    );
    chunk.forEach((c, j) => {
      rows.push({
        comment_id: c.commentId,
        media_id: c.mediaId,
        commenter_username: c.username,
        comment_text: c.text,
        comment_at: c.timestamp,
        draft_reply: drafts[j].draft, // null 이면 어드민이 직접 작성
      });
    });
  }

  const inserted = await insertDrafts(admin, rows);
  const payload = {
    ok: true,
    collected: comments.length,
    new: fresh.length,
    inserted,
    draftFailed: rows.filter((r) => r.draft_reply === null).length,
  };
  console.log("[ig-comment-drafts] 결과:", JSON.stringify(payload));
  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}

export async function POST(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return run();
}
