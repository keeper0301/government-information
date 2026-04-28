// ============================================================
// /api/indexnow-submit-recent — 최근 24h 발행 글 자동 색인 ping
// ============================================================
// 매일 KST 16:00 (publish-blog 끝난 후 1시간) 에 자동 호출:
//   1) 최근 24h blog_posts (published_at) 조회
//   2) 최근 24h news_posts (published_at) 조회 (선택, 양 많으면 skip)
//   3) URL list → IndexNow ping (네이버 + Bing/Yandex 동시)
//
// 효과:
//   - 매일 7글 (publish-blog) + 새 뉴스 = 약 50 URL/day
//   - 검색봇이 "방문" 기다리지 않고 push → 색인 시간 1~2주 → 1~3일
//   - 네이버 D.I.A 알고리즘 신선도 시그널 ↑
//
// 안정성:
//   - INDEXNOW_KEY 미설정 시 skip (운영 영향 0)
//   - 네이버·indexnow.org 둘 다 실패해도 cron 재시도 안 함 (다음날 cron 자연 회복)
//   - publish-blog 와 분리 — publish 안정성 영향 0
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitToIndexNow } from "@/lib/indexnow";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
const RECENT_HOURS = 24;
const NEWS_LIMIT = 100; // news 가 많아 무한 ping 방지

export const maxDuration = 30;

async function runSubmitRecent() {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - RECENT_HOURS * 60 * 60 * 1000).toISOString();

  // 1) 최근 24h blog_posts
  const { data: blogs, error: blogErr } = await supabase
    .from("blog_posts")
    .select("slug, published_at, updated_at")
    .gte("published_at", since)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (blogErr) {
    return NextResponse.json(
      { error: `blog select 실패: ${blogErr.message}` },
      { status: 500 },
    );
  }

  // 2) 최근 24h news_posts (RSS 등록 보완 — IndexNow 가 더 빠름)
  const { data: news, error: newsErr } = await supabase
    .from("news_posts")
    .select("slug, published_at")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(NEWS_LIMIT);

  if (newsErr) {
    console.error("[indexnow-submit-recent] news select 실패:", newsErr);
    // news 실패해도 blog 는 진행
  }

  // URL list — keepioo 절대 URL
  const urls: string[] = [];
  for (const b of blogs || []) {
    urls.push(`${SITE_URL}/blog/${b.slug}`);
  }
  for (const n of news || []) {
    urls.push(`${SITE_URL}/news/${n.slug}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ submitted: 0, note: "최근 24h 발행 글 없음" });
  }

  // IndexNow ping — 네이버 + indexnow.org (Bing/Yandex 자동 분배)
  const results = await submitToIndexNow(urls);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    blog_count: blogs?.length ?? 0,
    news_count: news?.length ?? 0,
    total_urls: urls.length,
    results,
  });
}

// CRON_SECRET 가드
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSubmitRecent();
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSubmitRecent();
}
