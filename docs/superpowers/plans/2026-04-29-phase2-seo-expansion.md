# Phase 2 — SEO 트래픽 확장 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** SEO 진입 키워드를 늘려 트래픽 부족 운영 이슈 해소. 기존 long-tail (eligibility·region·cross 등) 외 (1) 연령 기반 long-tail 페이지 + (2) 카테고리 hub 4종 추가.

**Architecture:**
- A1 = age 기반 SSG 페이지 (`/welfare/age/[age]`, `/loan/age/[age]`) — region 패턴 응용
- A2 = 4 카테고리 hub (`/c/[category]`) — 통합 큐레이션 (정책 + 가이드 + 블로그)
- 모두 `dynamicParams=false` + `revalidate=3600~21600` ISR. thin-content 방지 (카운트 ≥ 5 만 sitemap 등록).

**Tech Stack:** Next.js 15 / Supabase / 기존 ProgramRow / popular-picks · guides · blog category 데이터 재사용.

---

## File Structure

### A1 — age 기반 long-tail (3h)
- **Create:** `lib/age-targeting.ts` — 연령 카탈로그 (5 age) + age key → DB age_target 매칭 함수
- **Create:** `app/welfare/age/[age]/page.tsx` — welfare age 페이지 SSG
- **Create:** `app/loan/age/[age]/page.tsx` — loan age 페이지 SSG
- **Modify:** `app/sitemap.ts` — age 페이지 5 × 2 = 10 URL 추가 (카운트 ≥ 5)
- **Test:** `__tests__/lib/age-targeting.test.ts` — catalog · DB key 매핑 검증

### A2 — 카테고리 hub 4종 (2h)
- **Create:** `lib/category-hubs.ts` — 4 카테고리 (youth · senior · business · housing) 메타·매칭 로직
- **Create:** `app/c/[category]/page.tsx` — hub 페이지 SSG (정책 + 가이드 + 블로그 + 뉴스)
- **Modify:** `app/sitemap.ts` — 4 hub URL 추가
- **Modify:** `components/nav.tsx` (또는 footer) — 4 hub 링크 노출 (사용자 진입로 + 내부 링크 SEO)
- **Test:** `__tests__/lib/category-hubs.test.ts` — 카테고리 슬러그·매칭 로직 검증

---

## 사장님 결정 포인트 (plan 진행 전 OK 필요)

1. **age 카탈로그 5종 OK?**
   - `youth` (청년·19~34세)
   - `middle` (중년·35~49세)
   - `senior` (노년·65세+)
   - `parent` (육아·자녀 양육)
   - `student` (학생·재학 중)
2. **카테고리 hub 4종 OK?**
   - `youth` (청년) / `senior` (노년) / `business` (자영업·소상공인) / `housing` (주거·전월세)
3. **`/c/[category]` 라우트 prefix `/c/` OK?** (짧음, 영어, SEO 친화) 또는 `/category/[slug]` 더 명확? 또는 한글 slug `/카테고리/[slug]`?

이 3개 결정만 받으면 즉시 구현 진행.

---

## Task 1: A1 age 기반 long-tail (10 step)

**Files:**
- Create: `lib/age-targeting.ts`
- Create: `app/welfare/age/[age]/page.tsx`, `app/loan/age/[age]/page.tsx`
- Modify: `app/sitemap.ts`
- Test: `__tests__/lib/age-targeting.test.ts`

### - [ ] Step 1: lib/age-targeting.ts 작성

```ts
// lib/age-targeting.ts
// 연령 기반 long-tail SEO 페이지의 카탈로그 + DB 매칭.
// /welfare/age/[age] · /loan/age/[age] 두 라우트가 공유.

export type AgeSlug = "youth" | "middle" | "senior" | "parent" | "student";

export interface AgeCategory {
  slug: AgeSlug;
  label: string;       // 한국어 라벨
  shortLabel: string;  // 카드/배지용 짧은 라벨
  description: string; // 메타 description
  // DB age_target_min/max 또는 household_target_tags 매칭 정보
  matchAge?: { min?: number; max?: number };
  householdTags?: string[]; // household_target_tags @> [] 매칭
}

export const AGE_CATALOG: Record<AgeSlug, AgeCategory> = {
  youth: {
    slug: "youth",
    label: "청년 (19~34세)",
    shortLabel: "청년",
    description: "19~34세 청년이 받을 수 있는 정부·지자체 지원 정책 모음. 자격·신청 방법·마감일을 한곳에 정리.",
    matchAge: { min: 19, max: 34 },
  },
  middle: {
    slug: "middle",
    label: "중년 (35~49세)",
    shortLabel: "중년",
    description: "35~49세 중년이 받을 수 있는 정부·지자체 지원 정책 모음. 의료·자녀·주거·창업 등 카테고리별로.",
    matchAge: { min: 35, max: 49 },
  },
  senior: {
    slug: "senior",
    label: "노년 (65세 이상)",
    shortLabel: "노년",
    description: "65세 이상 어르신이 받을 수 있는 노인 복지·연금·의료비·돌봄 정책 모음.",
    matchAge: { min: 65 },
    householdTags: ["elderly"],
  },
  parent: {
    slug: "parent",
    label: "육아·자녀양육",
    shortLabel: "육아",
    description: "자녀를 양육 중인 부모가 받을 수 있는 양육비·교육비·돌봄 정책 모음.",
    householdTags: ["multi_child", "single_parent"],
  },
  student: {
    slug: "student",
    label: "학생 (재학·휴학)",
    shortLabel: "학생",
    description: "초·중·고·대학 재학생이 받을 수 있는 학자금·생활비·문화비 지원 정책 모음.",
    matchAge: { min: 7, max: 24 },
  },
};

export const AGE_SLUGS = Object.keys(AGE_CATALOG) as AgeSlug[];

export function getAgeCategory(slug: string): AgeCategory | null {
  return (AGE_CATALOG as Record<string, AgeCategory>)[slug] ?? null;
}
```

### - [ ] Step 2: 단위 테스트 작성

```ts
// __tests__/lib/age-targeting.test.ts
import { describe, expect, it } from "vitest";
import { AGE_CATALOG, AGE_SLUGS, getAgeCategory } from "@/lib/age-targeting";

describe("age-targeting catalog", () => {
  it("AGE_SLUGS 가 5종이고 모두 catalog 와 일치", () => {
    expect(AGE_SLUGS).toHaveLength(5);
    for (const slug of AGE_SLUGS) {
      expect(AGE_CATALOG[slug].slug).toBe(slug);
    }
  });

  it("getAgeCategory 가 알려진 slug 반환", () => {
    const youth = getAgeCategory("youth");
    expect(youth).not.toBeNull();
    expect(youth?.matchAge?.min).toBe(19);
    expect(youth?.matchAge?.max).toBe(34);
  });

  it("getAgeCategory 가 unknown slug 에 null 반환", () => {
    expect(getAgeCategory("unknown")).toBeNull();
  });
});
```

### - [ ] Step 3: tsc + vitest 1차 검증

```bash
npm run ci
```
Expected: 19 → 20 file 300+3 = 303 tests pass.

### - [ ] Step 4: app/welfare/age/[age]/page.tsx 작성

`/welfare/region/[code]/page.tsx` 를 reference 로 동일 패턴 적용:
- generateStaticParams = AGE_SLUGS.map(slug => ({ age: slug }))
- dynamicParams = false
- revalidate = 3600
- 매칭 query: `age_target_min/max` 범위 + (있으면) `household_target_tags @> householdTags`
- DISPLAY_LIMIT = 50
- 비매칭 source_code 제외 (`WELFARE_EXCLUDED_FILTER`)
- ProgramRow 컴포넌트로 카드 렌더
- `notFound()` for unknown age
- generateMetadata: title `${label} 복지 정책 가이드`, keywords, alternates.canonical, openGraph

(코드 분량 ~120줄, region 페이지 그대로 변형.)

### - [ ] Step 5: app/loan/age/[age]/page.tsx 작성

Step 4 와 동일 패턴, `loan_programs` + `LOAN_EXCLUDED_FILTER` + `loanToDisplay`.

### - [ ] Step 6: app/sitemap.ts 에 age 페이지 추가

```ts
// 연령 long-tail 페이지 — age 카탈로그 5종 × 2 (welfare/loan)
// 카운트 ≥ 5 만 sitemap 등록 (thin-content 방지)
const ageWelfareCounts = await getAgeCounts(supabase, "welfare_programs");
const ageLoanCounts = await getAgeCounts(supabase, "loan_programs");
const agePages: MetadataRoute.Sitemap = [];
for (const slug of AGE_SLUGS) {
  if ((ageWelfareCounts.get(slug) ?? 0) >= 5) {
    agePages.push({
      url: `${baseUrl}/welfare/age/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.75,
    });
  }
  if ((ageLoanCounts.get(slug) ?? 0) >= 5) {
    agePages.push({
      url: `${baseUrl}/loan/age/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.75,
    });
  }
}
```

`getAgeCounts` 헬퍼는 `lib/age-targeting.ts` 에 추가.

### - [ ] Step 7: tsc + vitest 검증

```bash
npm run ci
```

### - [ ] Step 8: 로컬 dev server 또는 next build 로 페이지 렌더 확인

(생략 가능 — 다음 Vercel preview 빌드에서 자동 검증)

### - [ ] Step 9: Commit (push 안 함)

```bash
git add lib/age-targeting.ts \
  app/welfare/age/[age]/page.tsx app/loan/age/[age]/page.tsx \
  app/sitemap.ts __tests__/lib/age-targeting.test.ts
git commit -m "feat(seo): 연령 long-tail SEO 페이지 5종 × welfare/loan = 10건 (Phase 2 A1)
...본문..."
```

### - [ ] Step 10: Spec + Code quality reviewer dispatch

---

## Task 2: A2 카테고리 hub 4종 (8 step)

**Files:**
- Create: `lib/category-hubs.ts`
- Create: `app/c/[category]/page.tsx`
- Modify: `app/sitemap.ts`, `components/nav.tsx`
- Test: `__tests__/lib/category-hubs.test.ts`

### - [ ] Step 1: lib/category-hubs.ts 작성

```ts
// lib/category-hubs.ts
// 4 카테고리 hub 페이지 메타 + 매칭 로직.
// 사용자 그룹 wedge: 청년·노년·자영업·주거.

export type CategorySlug = "youth" | "senior" | "business" | "housing";

export interface CategoryHub {
  slug: CategorySlug;
  emoji: string;
  label: string;        // "청년 정책"
  shortLabel: string;   // 짧은 라벨 ("청년")
  hero: string;         // hero 설명 (1~2 문장)
  description: string;  // SEO meta description
  benefitTags: string[]; // BENEFIT_TAGS 매칭 (welfare/loan 카테고리 동기화)
  blogCategory?: string; // /blog/category/[category] 연결
}

export const CATEGORY_HUBS: Record<CategorySlug, CategoryHub> = {
  youth: {
    slug: "youth",
    emoji: "🌱",
    label: "청년 정책",
    shortLabel: "청년",
    hero: "19~34세 청년을 위한 정부·지자체 지원을 한곳에. 청년수당·청년주거·청년창업·자격증 비용까지.",
    description: "청년 정책 종합 가이드. 청년수당·취업·주거·창업·교육비 지원 한곳에 정리.",
    benefitTags: ["청년", "교육·학자금", "취업·창업"],
    blogCategory: "청년",
  },
  senior: {
    slug: "senior",
    emoji: "🌷",
    label: "노년·어르신 정책",
    shortLabel: "노년",
    hero: "65세 이상 어르신을 위한 연금·의료·돌봄·여가 정책 종합 가이드.",
    description: "노인 복지 종합 가이드. 기초연금·노인장기요양·의료비·여가·돌봄 한곳에.",
    benefitTags: ["노년", "의료·건강", "돌봄·생활"],
    blogCategory: "노년",
  },
  business: {
    slug: "business",
    emoji: "🏪",
    label: "자영업·소상공인",
    shortLabel: "자영업",
    hero: "소상공인·자영업자를 위한 정책자금·세제·홍보·교육 지원 모음.",
    description: "자영업·소상공인 종합 가이드. 정책자금·창업·세제·교육·재기 지원 한곳에.",
    benefitTags: ["취업·창업", "정책자금"],
    blogCategory: "자영업자",
  },
  housing: {
    slug: "housing",
    emoji: "🏠",
    label: "주거·전월세 지원",
    shortLabel: "주거",
    hero: "전월세 보증금·임대주택·주거급여·청년주거 지원 종합 가이드.",
    description: "주거 지원 종합 가이드. 전월세 보증금·임대주택·주거급여·청년주거 한곳에.",
    benefitTags: ["주거"],
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_HUBS) as CategorySlug[];

export function getCategoryHub(slug: string): CategoryHub | null {
  return (CATEGORY_HUBS as Record<string, CategoryHub>)[slug] ?? null;
}
```

### - [ ] Step 2: 단위 테스트

```ts
// __tests__/lib/category-hubs.test.ts
import { describe, expect, it } from "vitest";
import { CATEGORY_HUBS, CATEGORY_SLUGS, getCategoryHub } from "@/lib/category-hubs";

describe("category-hubs", () => {
  it("4 카테고리 정의 + slug 일관성", () => {
    expect(CATEGORY_SLUGS).toHaveLength(4);
    for (const slug of CATEGORY_SLUGS) {
      expect(CATEGORY_HUBS[slug].slug).toBe(slug);
      expect(CATEGORY_HUBS[slug].benefitTags.length).toBeGreaterThan(0);
    }
  });

  it("getCategoryHub 알려진 slug 반환·unknown null", () => {
    expect(getCategoryHub("youth")?.label).toBe("청년 정책");
    expect(getCategoryHub("unknown")).toBeNull();
  });
});
```

### - [ ] Step 3: tsc + vitest 1차 검증

### - [ ] Step 4: app/c/[category]/page.tsx 작성

서버 컴포넌트, 4 hub 데이터 통합 fetch:
- generateStaticParams + dynamicParams=false + revalidate=3600
- 데이터:
  1. 매칭 정책 5건 (welfare + loan, benefitTags 매칭)
  2. 마감 임박 5건 (apply_end asc)
  3. 관련 가이드 3건 (`getGuides()` 에서 benefitTags 매칭)
  4. 관련 블로그 3건 (blog_posts category = blogCategory)
- 섹션 4개 + Hero
- JSON-LD: `CollectionPage` schema
- 분량 ~150줄

### - [ ] Step 5: nav.tsx 에 4 hub 링크 추가

기존 nav 구조 확인 후 적절 위치 (footer 또는 기존 카테고리 영역) 에 4 카테고리 링크. 모바일 drawer 도 동기화.

### - [ ] Step 6: sitemap 4 hub URL 추가

```ts
const hubPages: MetadataRoute.Sitemap = CATEGORY_SLUGS.map((slug) => ({
  url: `${baseUrl}/c/${slug}`,
  lastModified: new Date(),
  changeFrequency: "weekly",
  priority: 0.8,
}));
```

### - [ ] Step 7: tsc + vitest 검증 + Commit

```bash
git add lib/category-hubs.ts app/c/[category]/page.tsx \
  app/sitemap.ts components/nav.tsx __tests__/lib/category-hubs.test.ts
git commit -m "feat(seo): 카테고리 hub 4종 (청년/노년/자영업/주거) (Phase 2 A2)
..."
```

### - [ ] Step 8: Spec + Code quality reviewer dispatch

---

## Task 3: Phase 2 마무리 + 메모리

### - [ ] Step 1: Phase 2 final reviewer dispatch
### - [ ] Step 2: master push (Task 1 + Task 2 묶음)
### - [ ] Step 3: 메모리 신규 작성 (`project_keepioo_phase2_seo_expansion.md`)
### - [ ] Step 4: MEMORY.md 추가
### - [ ] Step 5: 마스터 plan ✅ 표시

---

## 자체 리뷰 체크리스트

- [x] thin-content 방지 (count ≥ 5 sitemap 가드)
- [x] 기존 region·eligibility 패턴 재사용 (회귀 위험 ↓)
- [x] dynamicParams=false (unknown slug 자동 404, SEO 부정 페이지 차단)
- [x] JSON-LD 추가 (CollectionPage schema)
- [x] 단위 테스트 카탈로그 일관성 검증

---

## 사장님 외부 액션

Phase 2 push 후:
1. Google Search Console 에서 신규 sitemap URL 색인 요청 (선택, 자동 크롤도 1~3일 안에 진입)
2. /c/youth 등 4 카테고리 URL 직접 SNS 공유 (홍보)

---

**Why:** 기존 long-tail 외 연령·카테고리 hub 추가로 검색 진입로 약 14개 (10 age + 4 hub) 신설. 메모리 모든 곳에 명시된 "트래픽 부족" 운영 이슈 직접 해소.

**How to apply:** 사장님 결정 3건 (age 카탈로그·카테고리·라우트 prefix) OK 후 task 1·2 순차 진행. Phase 1 과 동일하게 subagent-driven.
