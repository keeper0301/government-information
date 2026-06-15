import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAllKeywords } from "@/lib/news-keywords";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";
import { cleanDescription } from "@/lib/utils";

// 2026-05-21 SC 색인 1,958 페이지 미생성 진단 후속:
// 정적·hub 페이지 lastModified 가 매 sitemap fetch 마다 new Date() 로 갱신되어
// Google 이 "진짜 변경 아님" 의심 → 색인 우선순위 ↓.
//
// revalidate 86400 = 24h 단위 build-time 고정. module-level SITEMAP_BUILD_TIME 이
// 24h 동안 같은 값 보장 (Next.js App Router force-static 패턴). 정책 detail
// (welfare/loan/news/blog) 의 updated_at 기준은 그대로 유지.
export const revalidate = 86400;
// 페이지네이션(.range 순회)으로 round-trip 이 늘어 안전망. 일 1회 생성이라 여유 큼.
export const maxDuration = 60;
const SITEMAP_BUILD_TIME = new Date();
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

// PostgREST 서버 max-rows(1000) 가 .limit(N>1000) 을 무시해 sitemap 이 1000 에서 잘리던
// 사고(welfare 10,223 중 1,000 만 제출) fix. .range() 로 1000 단위 순회해 전체 행 수집.
// 안정 정렬(.order)을 호출자가 붙여야 페이지 경계 중복/누락이 없다.
async function paginateAll<T>(
  build: (from: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data } = await build(from);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://keepioo.com";
  const supabase = await createClient();

  // Static pages — lastModified 는 SITEMAP_BUILD_TIME 고정 (Google "진짜 변경" 신호 정확화)
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/welfare`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/loan`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.9 },
    ...(!ADSENSE_REVIEW_MODE
      ? [{ url: `${baseUrl}/news`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily" as const, priority: 0.9 }]
      : []),
    { url: `${baseUrl}/calendar`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/recommend`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/popular`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/consult`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/alerts`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/pricing`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/terms`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/refund`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/help`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/eligibility`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/guides`, lastModified: SITEMAP_BUILD_TIME, changeFrequency: "weekly", priority: 0.7 },
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

  // Welfare programs — 2026-05-18 AdSense 재거절 후 엄격 강화.
  // unique_insight 보유 페이지만 sitemap 등록 (detail page noindex 정책과 일관).
  // welfare/[id]/page.tsx 의 isSparse 가 !hasInsight 면 noindex 처리 → sitemap 에서
  // 같은 row 빼지 않으면 Search Console "Indexed, though blocked by noindex" 경고 +
  // AdSense 검수자가 sitemap → noindex URL 도달 시 부정 시그널.
  // 2026-06-14 — .limit(15000) 이 PostgREST max-rows(1000) 에 막혀 welfare 가 1,000 에서
  // 잘리던 사고(10,223 중 9,223 누락) fix. .range() 페이지네이션으로 전체 수집.
  const welfare = await paginateAll<{ id: string; updated_at: string; unique_insight_at: string | null }>(
    (from) =>
      supabase
        .from("welfare_programs")
        .select("id, updated_at, unique_insight_at")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .not("unique_insight_at", "is", null)
        .not("is_hidden", "is", true) // 회수(숨김) 정책 제외 — 상세는 404 라 sitemap 에 두면 SC 404 경고
        .is("duplicate_of_id", null) // 중복 정책 제외 — 목록과 동일 기준(중복 콘텐츠 색인 방지)
        .order("id", { ascending: true }) // .range() 안정 정렬(페이지 경계 중복/누락 방지)
        .range(from, from + 999),
  );
  const welfarePages: MetadataRoute.Sitemap = welfare.map((w) => {
    const insightAt = (w as { unique_insight_at?: string | null }).unique_insight_at!;
    const lastModSrc = new Date(insightAt) > new Date(w.updated_at) ? insightAt : w.updated_at;
    return {
      url: `${baseUrl}/welfare/${w.id}`,
      lastModified: new Date(lastModSrc),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    };
  });

  // Welfare 광역별 SEO 페이지 17개 — path-based long-tail.
  // 17 광역 모두 활성 정책 ≥100건 보유 (실측 2026-04-28) — thin-content 위험 0.
  const welfareRegionPages: MetadataRoute.Sitemap = PROVINCES.map((p) => ({
    url: `${baseUrl}/welfare/region/${p.code}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Loan programs — welfare 와 동일 패턴 + 동일 페이지네이션 fix (1000 cap 우회).
  const loans = await paginateAll<{ id: string; updated_at: string; unique_insight_at: string | null }>(
    (from) =>
      supabase
        .from("loan_programs")
        .select("id, updated_at, unique_insight_at")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .not("unique_insight_at", "is", null)
        .not("is_hidden", "is", true) // 회수(숨김) 정책 제외 — 상세 404 와 정합
        .is("duplicate_of_id", null) // 중복 정책 제외 — 중복 콘텐츠 색인 방지
        .order("id", { ascending: true })
        .range(from, from + 999),
  );
  const loanPages: MetadataRoute.Sitemap = loans.map((l) => {
    const insightAt = (l as { unique_insight_at?: string | null }).unique_insight_at!;
    const lastModSrc = new Date(insightAt) > new Date(l.updated_at) ? insightAt : l.updated_at;
    return {
      url: `${baseUrl}/loan/${l.id}`,
      lastModified: new Date(lastModSrc),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    };
  });

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
  // 2026-05-21 — limit 명시 (현재 201 row 라 영향 미미, 미래 확장 안전망)
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .not("published_at", "is", null)
    .limit(5000);
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

  let newsPages: MetadataRoute.Sitemap = [];
  let keywordPages: MetadataRoute.Sitemap = [];
  let topicPages: MetadataRoute.Sitemap = [];

  if (!ADSENSE_REVIEW_MODE) {
    // 2026-05-30 selective sitemap — summary + classified_at + ai_commentary(P2)
    // 셋 다 채워진 news 만 포함. review mode off 직후 "갑작스러운 대량 thin page" 가
    // Google 에 일제히 색인되는 위험 차단. AI 백필 cron 진행에 맞춰 점진 ramp-up.
    // 1000 cap 우회 — welfare/loan 과 동일 페이지네이션(news 색인가능분 5천+ 가 1000 에서
    // 잘리던 것 fix). body≥250 필터는 수집 후 적용.
    const newsPosts = await paginateAll<{ slug: string; updated_at: string; body: string }>(
      (from) =>
        supabase
          .from("news_posts")
          .select("slug, updated_at, body")
          .neq("category", "press")
          .not("keywords", "eq", "{}")
          .not("summary", "is", null)
          .not("classified_at", "is", null)
          .not("ai_commentary", "is", null)
          .order("slug", { ascending: true })
          .range(from, from + 999),
    );
    newsPages = newsPosts
      // 2026-06-07 — news 상세 isThin 의 본문 조건(cleanDescription(body)<250)과 일치
      // (코드리뷰 P1). 상세는 noindex 인데 sitemap 에만 있으면 "Indexed, though blocked
      // by noindex" 부정 신호 → 본문 250 미만 뉴스는 sitemap 에서도 제외.
      .filter((n) => cleanDescription(n.body).length >= 250)
      .map((n) => ({
        url: `${baseUrl}/news/${encodeURIComponent(n.slug)}`,
        lastModified: new Date(n.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    keywordPages = getAllKeywords().map((k) => ({
      url: `${baseUrl}/news/keyword/${encodeURIComponent(k)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

    const { TOPIC_CATEGORIES } = await import(
      "@/lib/news-collectors/korea-kr-topics"
    );
    topicPages = TOPIC_CATEGORIES.map((t) => ({
      url: `${baseUrl}/news?topic=${encodeURIComponent(t.name)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
  }

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
