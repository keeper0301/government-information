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

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: Request) {
  // Bearer 인증
  const secret = process.env.NAVER_EXTENSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NAVER_EXTENSION_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      "id, blog_post_id, attempt_count, blog_post:blog_posts!inner(slug, title, content, meta_description, category, cover_image)",
    )
    .eq("status", "pending")
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ status: "db_error", error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ status: "no_pending" });
  }

  // attempt_count 증가
  await admin
    .from("naver_blog_queue")
    .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
    .eq("id", row.id);

  // SE3 호환 HTML 변환
  const blogPostRaw = row.blog_post as unknown;
  const post = Array.isArray(blogPostRaw) ? blogPostRaw[0] : blogPostRaw;
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
