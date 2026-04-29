// ============================================================
// /c/[category] hub 페이지 4종의 카탈로그 + 매칭 로직
// ============================================================
// 사용자 그룹 wedge: 청년·노년·자영업·주거.
//
// 매칭 전략 (PostgREST 광범위 노출용 overlaps 권장):
//   - benefitTags  → welfare/loan 의 benefit_tags 컬럼 (string[]) 과 overlaps
//   - ageTags      → welfare/loan 의 age_tags 컬럼 (string[]) 과 overlaps
//   - occupationTags → welfare/loan 의 occupation_tags 컬럼 (string[]) 과 overlaps
//
//   세 축 중 하나라도 겹치면 노출 (관대한 매칭 — hub 의 의도는 광범위 노출).
//   값은 모두 lib/tags/taxonomy.ts 의 BENEFIT_TAGS · AGE_TAGS ·
//   OCCUPATION_TAGS 한국어 표준에 맞춤 (분류 통일 2026-04-25).
//
// label/shortLabel/hero/description 은 SEO·UI 용 한국어 (검색 키워드 포함).
// blogCategory 는 /blog/category/[category] 라우트의 한글 slug 와 일치.
// ============================================================

export type CategorySlug = "youth" | "senior" | "business" | "housing";

export interface CategoryHub {
  slug: CategorySlug;
  emoji: string;
  /** 헤더·OG 용 풀 라벨 — "청년 정책" */
  label: string;
  /** 짧은 라벨 — 칩·다른 hub 회유 링크용 */
  shortLabel: string;
  /** hero 영역 1~2 문장 설명 */
  hero: string;
  /** SEO meta description (160자 이내 권장) */
  description: string;
  /** welfare/loan benefit_tags 매칭값 (BENEFIT_TAGS 한국어 표준) */
  benefitTags: string[];
  /** welfare/loan age_tags 매칭값 (AGE_TAGS 한국어 표준). 없으면 빈 배열. */
  ageTags: string[];
  /** welfare/loan occupation_tags 매칭값 (OCCUPATION_TAGS 한국어 표준). 없으면 빈 배열. */
  occupationTags: string[];
  /** /blog/category/[category] 한글 slug (blog_posts.category) */
  blogCategory?: string;
}

export const CATEGORY_HUBS: Record<CategorySlug, CategoryHub> = {
  youth: {
    slug: "youth",
    emoji: "🌱",
    label: "청년 정책",
    shortLabel: "청년",
    hero:
      "19~34세 청년을 위한 정부·지자체 지원을 한곳에. 청년수당·청년주거·청년창업·자격증 비용까지.",
    description:
      "청년 정책 종합 가이드. 청년수당·취업·주거·창업·교육비 지원 한곳에 정리.",
    benefitTags: ["교육", "취업", "창업", "주거"],
    ageTags: ["청년"],
    occupationTags: [],
    blogCategory: "청년",
  },
  senior: {
    slug: "senior",
    emoji: "🌷",
    label: "노년·어르신 정책",
    shortLabel: "노년",
    hero:
      "65세 이상 어르신을 위한 연금·의료·돌봄·여가 정책 종합 가이드.",
    description:
      "노인 복지 종합 가이드. 기초연금·노인장기요양·의료비·여가·돌봄 한곳에.",
    benefitTags: ["의료", "생계", "문화"],
    ageTags: ["노년"],
    occupationTags: [],
    blogCategory: "노년",
  },
  business: {
    slug: "business",
    emoji: "🏪",
    label: "자영업·소상공인",
    shortLabel: "자영업",
    hero:
      "소상공인·자영업자를 위한 정책자금·세제·홍보·교육 지원 모음.",
    description:
      "자영업·소상공인 종합 가이드. 정책자금·창업·세제·교육·재기 지원 한곳에.",
    benefitTags: ["창업", "금융", "취업"],
    ageTags: [],
    occupationTags: ["소상공인", "자영업자", "창업자"],
    blogCategory: "소상공인",
  },
  housing: {
    slug: "housing",
    emoji: "🏠",
    label: "주거·전월세 지원",
    shortLabel: "주거",
    hero:
      "전월세 보증금·임대주택·주거급여·청년주거 지원 종합 가이드.",
    description:
      "주거 지원 종합 가이드. 전월세 보증금·임대주택·주거급여·청년주거 한곳에.",
    benefitTags: ["주거"],
    ageTags: [],
    occupationTags: [],
    blogCategory: "주거",
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_HUBS) as CategorySlug[];

/** 알려진 slug 면 hub, 아니면 null (404 라우팅용). */
export function getCategoryHub(slug: string): CategoryHub | null {
  return (CATEGORY_HUBS as Record<string, CategoryHub>)[slug] ?? null;
}

// ============================================================
// PostgREST or-clause 빌더 — 세 축 (benefit/age/occupation) 합집합
// ============================================================
// hub 의 정의된 축들에 대해 `column.ov.{값1,값2,...}` 조건을 콤마로 합쳐
// 한 번의 .or() 호출로 던지기 위한 string. 빈 배열 축은 조건에서 제외해
// over-recall (모든 row 매칭) 방지.
//
// 모든 축이 빈 배열이면 null 반환 → 호출부가 .or() 자체를 skip 해야
// PostgREST 신택스 에러 회피.
// ============================================================
export function buildHubOrClause(hub: CategoryHub): string | null {
  const conds: string[] = [];
  if (hub.benefitTags.length > 0) {
    conds.push(`benefit_tags.ov.{${hub.benefitTags.join(",")}}`);
  }
  if (hub.ageTags.length > 0) {
    conds.push(`age_tags.ov.{${hub.ageTags.join(",")}}`);
  }
  if (hub.occupationTags.length > 0) {
    conds.push(`occupation_tags.ov.{${hub.occupationTags.join(",")}}`);
  }
  return conds.length > 0 ? conds.join(",") : null;
}
