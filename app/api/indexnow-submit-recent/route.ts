// ============================================================
// /api/indexnow-submit-recent — 최근 24h 발행 글 자동 색인 ping
// ============================================================
// 매일 KST 16:00 (publish-blog 끝난 후 1시간) 에 자동 호출:
//   1) 최근 24h blog_posts (published_at) 조회
//   2) URL list → IndexNow ping (네이버 + Bing/Yandex 동시)
//
// 효과:
//   - 매일 발행되는 자체 블로그 글을 검색엔진에 빠르게 알림
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
import { authorizeCronRequest } from "@/lib/cron-auth";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
const RECENT_HOURS = 24;
const NEWS_LIMIT = 100; // 승인 후 뉴스까지 다시 색인 알림할 때 과다 전송 방지
const POLICY_LIMIT = 300; // 24h 신규 enrich 복지·대출 색인 알림 상한(IndexNow quota 보호)

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

  let news: Array<{ slug: string }> = [];
  if (!ADSENSE_REVIEW_MODE) {
    const { data: newsData, error: newsErr } = await supabase
      .from("news_posts")
      .select("slug, published_at")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(NEWS_LIMIT);

    if (newsErr) {
      console.error("[indexnow-submit-recent] news select 실패:", newsErr);
    }
    news = newsData ?? [];
  }

  // 2026-06-12 고도화 — 최근 24h 신규 enrich(색인 가능해진) 복지·대출도 IndexNow push.
  // 기준: unique_insight_at >= since(=색인 가능 전환 시점) + sitemap 과 동일 EXCLUDED 필터
  // + unique_insight_at not null. 이전엔 블로그·뉴스만 다뤄 신규 정책 색인이 크롤 대기(수주)
  // 였던 갭 해소. welfare/loan 은 review mode 와 무관(항상 색인 대상).
  const fetchRecentPolicy = async (
    table: "welfare_programs" | "loan_programs",
    filter: string,
  ) => {
    const { data, error } = await supabase
      .from(table)
      .select("id, unique_insight_at")
      .gte("unique_insight_at", since)
      .not("unique_insight_at", "is", null)
      .not("source_code", "in", filter)
      .order("unique_insight_at", { ascending: false })
      .limit(POLICY_LIMIT);
    if (error) console.error(`[indexnow-submit-recent] ${table} select 실패:`, error);
    return (data ?? []) as Array<{ id: string }>;
  };
  const [welfare, loan] = await Promise.all([
    fetchRecentPolicy("welfare_programs", WELFARE_EXCLUDED_FILTER),
    fetchRecentPolicy("loan_programs", LOAN_EXCLUDED_FILTER),
  ]);

  // URL list — keepioo 절대 URL
  const urls: string[] = [];
  for (const b of blogs || []) {
    urls.push(`${SITE_URL}/blog/${b.slug}`);
  }
  for (const n of news) {
    urls.push(`${SITE_URL}/news/${n.slug}`);
  }
  for (const w of welfare) {
    urls.push(`${SITE_URL}/welfare/${w.id}`);
  }
  for (const l of loan) {
    urls.push(`${SITE_URL}/loan/${l.id}`);
  }

  if (urls.length === 0) {
    return NextResponse.json({ submitted: 0, note: "최근 24h 발행 글 없음" });
  }

  // IndexNow ping — 네이버 + indexnow.org (Bing/Yandex 자동 분배)
  const results = await submitToIndexNow(urls);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    blog_count: blogs?.length ?? 0,
    news_count: news.length,
    welfare_count: welfare.length,
    loan_count: loan.length,
    total_urls: urls.length,
    results,
  });
}

// CRON_SECRET 가드
export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  return runSubmitRecent();
}

export async function POST(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  return runSubmitRecent();
}
