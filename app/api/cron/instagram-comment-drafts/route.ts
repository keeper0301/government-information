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
import { sendOpsAlertTelegram } from "@/lib/notifications/telegram-ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function run() {
  const result = await collectAndDraftComments(createAdminClient());
  console.log("[ig-comment-drafts] 결과:", JSON.stringify(result));

  // 신규 초안이 실제로 생겼을 때만 1회 알림(검수 리마인드). 6시간 cron 이라 최대 4/일,
  // inserted=0 이면 조용 → 스팸 아닌 actionable 알림. 수동 버튼(collectNow)은 화면 배너라 알림 X.
  if (result.ok && "inserted" in result && result.inserted > 0) {
    try {
      await sendOpsAlertTelegram({
        subject: "인스타 댓글 답글 검수 대기",
        message: `새 댓글 ${result.inserted}건의 AI 답글 초안이 생성됐습니다. 검수·승인: https://www.keepioo.com/admin/instagram-comments`,
      });
    } catch {
      // 알림 실패가 cron 을 깨지 않게.
    }
  }

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
