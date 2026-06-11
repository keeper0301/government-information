// ============================================================
// /rss — RSS 2.0 피드 (네이버 검색 로봇·RSS 리더용)
// ============================================================
// 네이버 서치어드바이저가 사이트 등록 시 자동으로 /rss 를 수집 시도함.
// 없으면 404 경고가 뜸 (색인 자체는 막지 않지만 노출 신호 약해짐).
// keepioo 자체 블로그 글을 최신순으로 제공.
//
// 캐시: 1시간 (콘텐츠 갱신 주기 대비 충분).
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

export const revalidate = 3600;

// RSS 본문에 들어가는 텍스트 안전화 — CDATA 종료 토큰 분리.
function safeCdata(text: string): string {
  return (text ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
}

export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
  const supabase = await createClient();

  const [newsRes, blogRes, welfareRes, loanRes] = await Promise.all([
    ADSENSE_REVIEW_MODE
      ? Promise.resolve({ data: [] })
      : supabase
          .from("news_posts")
          .select("slug, title, summary, published_at")
          .order("published_at", { ascending: false })
          .limit(30),
    supabase
      .from("blog_posts")
      .select("slug, title, meta_description, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(ADSENSE_REVIEW_MODE ? 40 : 10),
    // 2026-06-11 — 복지·대출 신규 정책도 RSS 노출(네이버 신규 색인 가속). 색인 대상
    // (unique_insight 있는 충실 페이지)만 — sitemap noindex 필터와 일관. review mode 무관
    // (unique_insight 있으면 thin 아님). description 은 정부 원문 대신 keepioo 자체 해설(차별화·DIA).
    supabase
      .from("welfare_programs")
      .select("id, title, unique_insight, published_at")
      // 상세 페이지(notFound)·sitemap 과 동일한 stale source 제외 — RSS 가 404 URL 흘리지 않게.
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .not("unique_insight", "is", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(15),
    supabase
      .from("loan_programs")
      .select("id, title, unique_insight, published_at")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .not("unique_insight", "is", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(10),
  ]);

  type FeedItem = {
    title: string;
    description: string;
    link: string;
    pubDate: string;
    guid: string;
    category: string;
  };

  const newsItems: FeedItem[] = (newsRes.data ?? []).map((n) => ({
    title: n.title,
    description: n.summary ?? "",
    link: `${baseUrl}/news/${encodeURIComponent(n.slug)}`,
    pubDate: new Date(n.published_at).toUTCString(),
    guid: `${baseUrl}/news/${encodeURIComponent(n.slug)}`,
    category: "정책소식",
  }));

  const blogItems: FeedItem[] = (blogRes.data ?? []).map((b) => ({
    title: b.title,
    description: b.meta_description ?? "",
    link: `${baseUrl}/blog/${encodeURIComponent(b.slug)}`,
    pubDate: new Date(b.published_at!).toUTCString(),
    guid: `${baseUrl}/blog/${encodeURIComponent(b.slug)}`,
    category: "정책 블로그",
  }));

  // insight 80자+ 만 — welfare/[id] 의 noindex 면제 기준(isSparse=!hasInsight, 80자)과 일치.
  // RSS 가 noindex 페이지 URL 을 흘리지 않게(빈/짧은 insight row 제외).
  const welfareItems: FeedItem[] = (welfareRes.data ?? [])
    .filter((w) => (w.unique_insight ?? "").trim().length >= 80)
    .map((w) => ({
      title: w.title,
      description: (w.unique_insight ?? "").slice(0, 250),
      link: `${baseUrl}/welfare/${w.id}`,
      pubDate: new Date(w.published_at!).toUTCString(),
      guid: `${baseUrl}/welfare/${w.id}`,
      category: "복지 지원사업",
    }));

  const loanItems: FeedItem[] = (loanRes.data ?? [])
    .filter((l) => (l.unique_insight ?? "").trim().length >= 80)
    .map((l) => ({
      title: l.title,
      description: (l.unique_insight ?? "").slice(0, 250),
      link: `${baseUrl}/loan/${l.id}`,
      pubDate: new Date(l.published_at!).toUTCString(),
      guid: `${baseUrl}/loan/${l.id}`,
      category: "대출·지원금",
    }));

  // slice 65 — 뉴스(당일 타임스탬프 30건)가 복지·대출(정부 공고일=과거)을 정렬상 밀어내
  // 50 cut 시 대출이 전부 잘리던 문제(코드리뷰 P1) 해소. 전 분류(최대 65건) 모두 포함.
  const items = [...newsItems, ...blogItems, ...welfareItems, ...loanItems]
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 65);

  const lastBuildDate = items[0]?.pubDate ?? new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>keepioo · 정책알리미</title>
    <link>${baseUrl}</link>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml" />
    <description>${ADSENSE_REVIEW_MODE ? "복지·대출·지원금 신청을 쉽게 이해할 수 있도록 정리한 정책 가이드" : "한국 정부·지자체의 복지·대출·지원금과 정책 뉴스 큐레이션"}</description>
    <language>ko</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>keepioo.com</generator>
${items
  .map(
    (it) => `    <item>
      <title><![CDATA[${safeCdata(it.title)}]]></title>
      <link>${it.link}</link>
      <description><![CDATA[${safeCdata(it.description)}]]></description>
      <pubDate>${it.pubDate}</pubDate>
      <guid isPermaLink="true">${it.guid}</guid>
      <category><![CDATA[${it.category}]]></category>
      <dc:creator><![CDATA[keepioo]]></dc:creator>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
