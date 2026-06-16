// ============================================================
// /api/naver-extension/next — Chrome Extension 이 발행할 다음 글 1건 조회
// ============================================================
// Extension 의 background.js 가 chrome.alarms 발화 시 호출.
// Bearer NAVER_EXTENSION_SECRET 인증. 시간대·일 cap 가드 포함.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertToNaverBlogHtml } from "@/lib/naver-blog/format";
import { countTodaySuccess, getKstHour } from "@/lib/naver-blog/audit";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";
import { authorizeNaverExtensionRequest } from "@/lib/naver-extension-auth";

export const dynamic = "force-dynamic";
// safeKeyEqual(node:crypto) 사용 — Edge runtime 미지원이므로 명시.
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  // Bearer 인증
  const denied = authorizeNaverExtensionRequest(request);
  if (denied) return denied;

  // 가드 — 시간대 + 일 cap (force=1 으로 우회 가능, 운영자 검증용)
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const kstHour = getKstHour();
  if (!force && (kstHour < 9 || kstHour >= 22)) {
    return NextResponse.json({ status: "outside_hours", kstHour });
  }

  // 일 cap — 신규 7일 3건 / 이후 7건
  const todayCount = await countTodaySuccess();
  const admin = createAdminClient();
  const { data: firstSuccess } = await admin
    .from("naver_publish_audit")
    .select("attempted_at")
    .eq("result", "success")
    .order("attempted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const isNewAccount =
    !firstSuccess?.attempted_at ||
    Date.now() - new Date(firstSuccess.attempted_at).getTime() < 7 * 86_400_000;
  const dailyCap = isNewAccount ? 3 : 7;
  if (!force && todayCount >= dailyCap) {
    return NextResponse.json({
      status: "daily_cap_reached",
      todayCount,
      dailyCap,
      isNewAccount,
    });
  }

  // pending 큐 1건 (FIFO)
  const { data: row, error } = await admin
    .from("naver_blog_queue")
    .select(
      "id, blog_post_id, attempt_count, blog_post:blog_posts!inner(slug, title, content, meta_description, category, cover_image, admin_review_required)",
    )
    .eq("status", "pending")
    .eq("blog_post.admin_review_required", false)
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ status: "db_error", error: error.message }, { status: 500 });
  }
  if (!row) {
    const { count: blockedByQuality } = await admin
      .from("naver_blog_queue")
      .select("id, blog_post:blog_posts!inner(id, admin_review_required)", {
        count: "exact",
        head: true,
      })
      .eq("status", "pending")
      .lt("attempt_count", 3)
      .or("admin_review_required.is.null,admin_review_required.eq.true", {
        referencedTable: "blog_post",
      });
    if ((blockedByQuality ?? 0) > 0) {
      return NextResponse.json({
        status: "quality_review_pending",
        blockedByQuality,
      });
    }
    return NextResponse.json({ status: "no_pending" });
  }

  // SE3 호환 HTML 변환 전 품질 재검수.
  // 기존 admin_review_required=false 만으로는 얇은 글/템플릿 냄새 글이 네이버에 올라갈 수 있어
  // 외부 채널용 최소 정보량·검색 의도·공식 신청 신호를 fail-closed로 한 번 더 본다.
  const blogPostRaw = row.blog_post as unknown;
  const post = Array.isArray(blogPostRaw) ? blogPostRaw[0] : blogPostRaw;
  const quality = assessExternalPublishQuality(post);
  if (!quality.approved) {
    if (!force) {
      await admin
        .from("blog_posts")
        .update({ admin_review_required: true })
        .eq("id", row.blog_post_id);
    }
    return NextResponse.json({
      status: "quality_gate_rejected",
      queueId: row.id,
      blogPostId: row.blog_post_id,
      reasons: quality.reasons,
      metrics: quality.metrics,
    });
  }

  // attempt_count 증가 — dry-run (force=1) 시 skip (큐 cap 소진 회피, I3 fix)
  // 품질 거절 글은 attempt_count를 소진하지 않고 admin_review_required=true로 넘긴다.
  if (!force) {
    await admin
      .from("naver_blog_queue")
      .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq("id", row.id);
  }

  const payload = convertToNaverBlogHtml(post);

  return NextResponse.json({
    status: "ready",
    queueId: row.id,
    blogPostId: row.blog_post_id,
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    backlinkUrl: payload.backlinkUrl,
    coverImageUrl: payload.coverImageUrl,
    kstHour,
    todayCount,
    dailyCap,
  });
}
