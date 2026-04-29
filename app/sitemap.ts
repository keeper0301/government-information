import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAllKeywords } from "@/lib/news-keywords";
import {
  CROSS_COMBINATIONS,
  ELIGIBILITY_CATALOG,
  ELIGIBILITY_SLUGS,
} from "@/lib/eligibility/catalog";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { getGuides } from "@/lib/policy-guides";
import { PROVINCES } from "@/lib/regions";
import { AGE_SLUGS, getAgeCounts } from "@/lib/age-targeting";
import { CATEGORY_SLUGS } from "@/lib/category-hubs";

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
    { url: `${baseUrl}/help`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/eligibility`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  // 정책 종합 가이드 (policy-bible 자산화) — 격주 발행, 영구 자산
  const guides = await getGuides(200);
  const guidePages: MetadataRoute.Sitemap = guides.map((g) => ({
    url: `${baseUrl}/guides/${g.slug}`,
    lastModified: new Date(g.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // 자격 카테고리 페이지 — Phase 1.5 long-tail SEO (income·household 8 slug)
  const eligibilityPages: MetadataRoute.Sitemap = ELIGIBILITY_SLUGS.map((slug) => ({
    url: `${baseUrl}/eligibility/${slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // 자격 복합 조합 페이지 — income × household 18 조합 중 매칭 ≥ 1 만 등록.
  // 0건 페이지를 sitemap 에 노출하면 thin-content 로 SEO 마이너스.
  // /eligibility 인덱스의 추천 카운트와 같은 로직 (welfare + loan 활성 정책의
  // income/household 페어 분포 집계).
  const today = new Date().toISOString().split("T")[0];
  const [welfareTargeting, loanTargeting] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("income_target_level, household_target_tags")
      .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .not("income_target_level", "is", null),
    supabase
      .from("loan_programs")
      .select("income_target_level, household_target_tags")
      .not("source_code", "in", LOAN_EXCLUDED_FILTER)
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .not("income_target_level", "is", null),
  ]);
  const crossCountMap = new Map<string, number>();
  for (const row of [
    ...(welfareTargeting.data ?? []),
    ...(loanTargeting.data ?? []),
  ]) {
    const income = row.income_target_level as string | null;
    const tags = (row.household_target_tags ?? []) as string[];
    if (!income) continue;
    for (const tag of tags) {
      const key = `${income}::${tag}`;
      crossCountMap.set(key, (crossCountMap.get(key) ?? 0) + 1);
    }
  }
  const crossPages: MetadataRoute.Sitemap = CROSS_COMBINATIONS
    .filter(({ income, household }) => {
      const key = `${ELIGIBILITY_CATALOG[income].dbKey}::${ELIGIBILITY_CATALOG[household].dbKey}`;
      return (crossCountMap.get(key) ?? 0) >= 1;
    })
    .map(({ income, household }) => ({
      url: `${baseUrl}/eligibility/cross/${income}/${household}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

  // 카테고리 hub 4종 — /c/[slug] (Phase 2 A2, youth/senior/business/housing).
  // 4 hub 모두 SSG + benefit/age/occupation 세 축 매칭이라 thin-content 위험 낮음.
  const hubPages: MetadataRoute.Sitemap = CATEGORY_SLUGS.map((slug) => ({
    url: `${baseUrl}/c/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // 연령 long-tail 페이지 — 5 age × welfare/loan = 10 페이지.
  // 카운트 ≥ 5 만 sitemap 등록 (thin-content 방지). 카운트 0~4 인 age 는
  // 페이지 자체는 살아있지만 sitemap 미노출 → 색인 압박 약화.
  const [welfareAgeCounts, loanAgeCounts] = await Promise.all([
    getAgeCounts(supabase, "welfare_programs", WELFARE_EXCLUDED_FILTER),
    getAgeCounts(supabase, "loan_programs", LOAN_EXCLUDED_FILTER),
  ]);
  const agePages: MetadataRoute.Sitemap = [];
  for (const slug of AGE_SLUGS) {
    if ((welfareAgeCounts.get(slug) ?? 0) >= 5) {
      agePages.push({
        url: `${baseUrl}/welfare/age/${slug}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.75,
      });
    }
    if ((loanAgeCounts.get(slug) ?? 0) >= 5) {
      agePages.push({
        url: `${baseUrl}/loan/age/${slug}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.75,
      });
    }
  }

  // Welfare programs
  const { data: welfare } = await supabase
    .from("welfare_programs")
    .select("id, updated_at")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER);
  const welfarePages: MetadataRoute.Sitemap = (welfare || []).map((w) => ({
    url: `${baseUrl}/welfare/${w.id}`,
    lastModified: new Date(w.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Welfare 광역별 SEO 페이지 17개 — path-based long-tail.
  // 17 광역 모두 활성 정책 ≥100건 보유 (실측 2026-04-28) — thin-content 위험 0.
  const welfareRegionPages: MetadataRoute.Sitemap = PROVINCES.map((p) => ({
    url: `${baseUrl}/welfare/region/${p.code}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Loan programs
  const { data: loans } = await supabase
    .from("loan_programs")
    .select("id, updated_at")
    .not("source_code", "in", LOAN_EXCLUDED_FILTER);
  const loanPages: MetadataRoute.Sitemap = (loans || []).map((l) => ({
    url: `${baseUrl}/loan/${l.id}`,
    lastModified: new Date(l.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Loan 광역별 SEO 페이지 17개 — path-based long-tail.
  // 17 광역 모두 활성 정책 ≥3건 보유 (세종 3건이 최소, 실측 2026-04-28).
  const loanRegionPages: MetadataRoute.Sitemap = PROVINCES.map((p) => ({
    url: `${baseUrl}/loan/region/${p.code}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
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

  // Blog 카테고리 페이지 7개 — SEO long-tail (네이버 D.I.A path-based URL 우대)
  // /blog/category/청년·노년·학생·교육·육아·가족·주거·소상공인·건강·복지
  const blogCategories = [
    "청년", "노년", "학생·교육", "육아·가족",
    "주거", "소상공인", "건강·복지",
  ];
  const blogCategoryPages: MetadataRoute.Sitemap = blogCategories.map((c) => ({
    url: `${baseUrl}/blog/category/${encodeURIComponent(c)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
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

  // 뉴스 주제 페이지 15개 — korea.kr 키워드 뉴스 분류 (대상별·주제별·핫이슈)
  // 쿼리 파라미터 기반이라 정식 별도 라우트보다 SEO 힘은 약하지만 Google 은
  // query-string URL 도 색인함. 각 주제별로 최신 뉴스 모음이 노출되어 long-tail
  // 검색 대응.
  const { TOPIC_CATEGORIES } = await import(
    "@/lib/news-collectors/korea-kr-topics"
  );
  const topicPages: MetadataRoute.Sitemap = TOPIC_CATEGORIES.map((t) => ({
    url: `${baseUrl}/news?topic=${encodeURIComponent(t.name)}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...hubPages,
    ...eligibilityPages,
    ...crossPages,
    ...agePages,
    ...keywordPages,
    ...topicPages,
    ...welfarePages,
    ...welfareRegionPages,
    ...loanPages,
    ...loanRegionPages,
    ...blogPages,
    ...blogCategoryPages,
    ...newsPages,
    ...guidePages,
  ];
}
