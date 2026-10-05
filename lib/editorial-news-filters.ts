import type { EditorialNews } from "@/lib/editorial-news-data";
import { BENEFIT_TAGS } from "@/lib/tags/taxonomy";
import { PROVINCES, INTEGRATED_JEONNAM_GWANGJU_REGION, getRegionPageByCode } from "@/lib/regions";

export interface NewsFilters { q?: string; benefit?: string; province?: string }
export const NEWS_REGIONS = [
  { code: "nationwide", name: "전국" },
  INTEGRATED_JEONNAM_GWANGJU_REGION,
  ...PROVINCES.filter(region => region.code !== "gwangju" && region.code !== "jeonnam")
    .map(region => ({ code: region.code, name: getRegionPageByCode(region.code)!.shortName })),
];

// 목록 탐색을 위한 상품권 분야·전국 발표 분류입니다. 신청 자격을 뜻하지 않습니다.
const classifications: Record<string, { benefits: string[]; regions: string[] }> = {
  "onnuri-reform-shop-checklist-2026": { benefits: ["금융"], regions: ["nationwide"] },
};

export function normalizeNewsFilters(filters: NewsFilters): Required<NewsFilters> {
  const province = ["gwangju", "jeonnam"].includes(filters.province ?? "") ? "jeonnam-gwangju" : filters.province;
  return { q: filters.q?.trim() ?? "",
    benefit: BENEFIT_TAGS.some(tag => tag === filters.benefit) ? filters.benefit! : "",
    province: NEWS_REGIONS.some(region => region.code === province) ? province! : "" };
}

export function filterEditorialNews(articles: EditorialNews[], filters: NewsFilters) {
  const { q, benefit, province } = normalizeNewsFilters(filters);
  const terms = q.toLocaleLowerCase("ko").split(/\s+/).filter(Boolean);
  return articles.filter(article => {
    const classification = classifications[article.slug];
    if (benefit && !classification?.benefits.includes(benefit)) return false;
    if (province && !classification?.regions.includes(province)) return false;
    const text = [article.title, article.question, article.answer, article.audience, article.sourceAgency,
      ...article.sections.flatMap(section => [section.heading, ...section.paragraphs])].join(" ").toLocaleLowerCase("ko");
    return terms.every(term => text.includes(term));
  });
}

export function newsFilterUrl(filters: NewsFilters, change: NewsFilters = {}) {
  const selected = normalizeNewsFilters({ ...filters, ...change });
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(selected)) if (value) params.set(key, value);
  return `/news${params.size ? `?${params}` : ""}`;
}
