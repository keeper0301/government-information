// ============================================================
// Instagram 댓글 답글 대기 큐 — DB 데이터 계층
// ============================================================
// instagram_comment_replies 테이블 CRUD. cron(수집)·어드민(승인/게시)이 사용.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type CommentReplyRow = {
  id: number;
  comment_id: string;
  media_id: string;
  commenter_username: string | null;
  comment_text: string;
  comment_at: string | null;
  draft_reply: string | null;
  status: string; // pending | approved | posted | skipped | failed
  posted_reply_id: string | null;
  error: string | null;
  created_at: string;
};

export type NewCommentRow = {
  comment_id: string;
  media_id: string;
  commenter_username: string | null;
  comment_text: string;
  comment_at: string | null;
  draft_reply: string | null;
};

// 이미 큐에 있는 comment_id 집합 — 중복 수집·재과금 방지용.
export async function existingCommentIds(
  admin: Admin,
  commentIds: string[],
): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("instagram_comment_replies")
    .select("comment_id")
    .in("comment_id", commentIds);
  if (error) {
    console.warn("[ig-comment-queue] existingCommentIds 조회 실패:", error.message);
    // 안전: 조회 실패 시 "모두 기존" 으로 간주해 중복 insert·재과금 방지.
    return new Set(commentIds);
  }
  return new Set((data ?? []).map((r) => r.comment_id as string));
}

// 신규 댓글 + 초안 일괄 insert. comment_id UNIQUE 라 충돌 시 무시.
export async function insertDrafts(
  admin: Admin,
  rows: NewCommentRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await admin
    .from("instagram_comment_replies")
    .upsert(rows, { onConflict: "comment_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[ig-comment-queue] insertDrafts 실패:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// 어드민 목록 — 상태별 최신순.
export async function listByStatus(
  admin: Admin,
  status: string,
  limit = 100,
): Promise<CommentReplyRow[]> {
  const { data, error } = await admin
    .from("instagram_comment_replies")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CommentReplyRow[];
}

export async function getById(admin: Admin, id: number): Promise<CommentReplyRow | null> {
  const { data } = await admin
    .from("instagram_comment_replies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CommentReplyRow | null) ?? null;
}

// 상태 전이 helper — updated_at 갱신 포함.
async function patch(admin: Admin, id: number, fields: Record<string, string | null>) {
  await admin
    .from("instagram_comment_replies")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export const markPosted = (admin: Admin, id: number, replyId: string) =>
  patch(admin, id, { status: "posted", posted_reply_id: replyId, error: null });
export const markFailed = (admin: Admin, id: number, err: string) =>
  patch(admin, id, { status: "failed", error: err.slice(0, 500) });
export const markSkipped = (admin: Admin, id: number) =>
  patch(admin, id, { status: "skipped" });
export const updateDraftText = (admin: Admin, id: number, text: string) =>
  patch(admin, id, { draft_reply: text });
