// ============================================================
// /admin/instagram-comments — IG 댓글 답글 승인/게시 server action (human-in-loop)
// ============================================================
// 사장님이 검수한 답글만 게시. 자동 공개 게시 없음.
// ============================================================

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/admin-auth";
import { loadValidToken } from "@/lib/instagram/oauth";
import { postCommentReply } from "@/lib/instagram/comments";
import {
  getById,
  markPosted,
  markFailed,
  markSkipped,
} from "@/lib/instagram/comment-queue";

const PATH = "/admin/instagram-comments";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) throw new Error("권한 없음");
}

function parseId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 id");
  return id;
}

// 승인 + 게시 — 사장님이 검수(편집 가능)한 reply 텍스트로 IG 에 답글 게시.
export async function approveAndPost(formData: FormData) {
  await requireAdmin();
  const id = parseId(formData);
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 280);
  if (!reply) throw new Error("답글 내용이 비어 있습니다");

  const admin = createAdminClient();
  const row = await getById(admin, id);
  if (!row) throw new Error("대상 댓글 없음");
  if (row.status === "posted") return; // 중복 게시 방지

  const tokenInfo = await loadValidToken(admin);
  if (!tokenInfo) {
    await markFailed(admin, id, "IG 토큰 없음/만료 — 재인증 필요");
    revalidatePath(PATH);
    return;
  }

  try {
    const replyId = await postCommentReply(tokenInfo.token, row.comment_id, reply);
    await markPosted(admin, id, replyId);
  } catch (e) {
    await markFailed(admin, id, e instanceof Error ? e.message : String(e));
  }
  revalidatePath(PATH);
}

// 건너뛰기 — 답글 안 함.
export async function skipComment(formData: FormData) {
  await requireAdmin();
  const id = parseId(formData);
  const admin = createAdminClient();
  await markSkipped(admin, id);
  revalidatePath(PATH);
}
