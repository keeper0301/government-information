// ============================================================
// /api/cron/instagram-comment-drafts — IG 댓글 수집 + AI 답글 초안 (human-in-loop)
// ============================================================
// @keepioo_official 최근 게시물의 새 댓글을 polling 으로 수집 → AI 답글 초안 생성 →
// instagram_comment_replies(status='pending') 저장. 게시는 어드민 승인 후(별도).
// 실제 수집 로직은 lib/instagram/collect-comments (어드민 "지금 수집" 버튼과 공용).
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { collectAndDraftComments } from "@/lib/instagram/collect-comments";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function run() {
  const result = await collectAndDraftComments(createAdminClient());
  console.log("[ig-comment-drafts] 결과:", JSON.stringify(result));
  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
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
