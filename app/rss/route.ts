// ============================================================
// /rss — RSS 2.0 피드 (네이버 검색 로봇·RSS 리더용)
// ============================================================
// 네이버 서치어드바이저가 사이트 등록 시 자동으로 /rss 를 수집 시도함.
// 없으면 404 경고가 뜸 (색인 자체는 막지 않지만 노출 신호 약해짐).
// keepioo 는 뉴스(/news)와 블로그(/blog) 두 종류 콘텐츠가 있으니 최신
// 40건을 하나의 RSS 피드로 묶어 제공.
//
// 캐시: 1시간 (콘텐츠 갱신 주기 대비 충분).
// ============================================================

import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600;

// RSS 본문에 들어가는 텍스트 안전화 — CDATA 종료 토큰 분리.
function safeCdata(text: string): string {
  return (text ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
}

export async function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
  const supabase = await createClient();

  const [newsRes, blogRes] = await Promise.all([
    supabase
      .from("news_posts")
      .select("slug, title, summary, published_at")
      .order("published_at", { ascending: false })
      .limit(30),
    supabase
      .from("blog_posts")
      .select("slug, title, meta_description, published_at")
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

  const items = [...newsItems, ...blogItems]
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 40);

  const lastBuildDate = items[0]?.pubDate ?? new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>keepioo · 정책알리미</title>
    <link>${baseUrl}</link>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml" />
    <description>한국 정부·지자체의 복지·대출·지원금과 정책 뉴스 큐레이션</description>
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
