import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAllKeywords } from "@/lib/news-keywords";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com";
  const supabase = await createClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/welfare`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/loan`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/news`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/calendar`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/recommend`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/popular`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/consult`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/alerts`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
  ];

  // Welfare programs
  const { data: welfare } = await supabase
    .from("welfare_programs")
    .select("id, updated_at");
  const welfarePages: MetadataRoute.Sitemap = (welfare || []).map((w) => ({
    url: `${baseUrl}/welfare/${w.id}`,
    lastModified: new Date(w.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Loan programs
  const { data: loans } = await supabase
    .from("loan_programs")
    .select("id, updated_at");
  const loanPages: MetadataRoute.Sitemap = (loans || []).map((l) => ({
    url: `${baseUrl}/loan/${l.id}`,
    lastModified: new Date(l.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Blog posts (발행된 글만) — 한글 slug 는 percent-encode 해서 XML sitemap 표준 준수
  // (일부 크롤러가 raw 한글을 CP949 등으로 재인코딩하는 문제 회피)
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .not("published_at", "is", null);
  const blogPages: MetadataRoute.Sitemap = (posts || []).map((p) => ({
    url: `${baseUrl}/blog/${encodeURIComponent(p.slug)}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // News posts (korea.kr 수집) — slug 는 `{title-slug}-{newsId}` 형식이며 title
  // 부분에 한글 포함. XML sitemap 표준상 한글 URL 은 percent-encode 해야 함.
  // 2026-04-24: 보도자료(press) + keepioo 키워드 매칭 안 된 노이즈는 비노출.
  const { data: newsPosts } = await supabase
    .from("news_posts")
    .select("slug, updated_at")
    .neq("category", "press")
    .not("keywords", "eq", "{}");
  const newsPages: MetadataRoute.Sitemap = (newsPosts || []).map((n) => ({
    url: `${baseUrl}/news/${encodeURIComponent(n.slug)}`,
    lastModified: new Date(n.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // 뉴스 키워드 페이지 24개 — SEO long-tail (청년·소상공인·지원금 등 각각 URL)
  const keywordPages: MetadataRoute.Sitemap = getAllKeywords().map((k) => ({
    url: `${baseUrl}/news/keyword/${encodeURIComponent(k)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...keywordPages,
    ...welfarePages,
    ...loanPages,
    ...blogPages,
    ...newsPages,
  ];
}
