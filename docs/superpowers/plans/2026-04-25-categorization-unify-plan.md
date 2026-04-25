# 분류 체계 통일 + 통합 검색·추천 강화 — 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 의 4개 페이지(welfare/loan/news/blog) 카테고리 분류를 `BENEFIT_TAGS` 14종으로 통일하고, `/api/search` 와 `/recommend` 에 news+blog 를 추가해 통합 검색·추천을 완성한다.

**Architecture:** DB 마이그레이션 3개로 비표준 카테고리 정규화 → 일괄 enrich 스크립트로 news 11K건 자동 태깅 → UI 4페이지에서 카테고리 칩을 DB 실측 기반으로 동적 렌더 → /api/search 와 /recommend 응답 구조 확장.

**Tech Stack:** Next.js 16.2 / TypeScript / Supabase Postgres / Tailwind. 별도 unit test 프레임워크 없음 — 검증은 SQL 실측 + 수동 UI smoke 로 수행.

**Spec:** `docs/superpowers/specs/2026-04-25-categorization-unify-design.md`

**작업 분량:** 16 task, 한 PR (master 직접 커밋·푸시) 로 진행.

**커밋 정책:** 각 task 마다 별도 commit. 단계 끝나면 한꺼번에 push 가 아니라, 각 commit 즉시 master 푸시 (keepioo workflow).

**롤백:** 모든 마이그레이션은 reverse SQL 을 주석으로 함께 보존. UI 변경은 git revert 로 즉시 복구 가능.

---

## 파일 구조 (작업 대상 전체 목록)

### DB 마이그레이션 (신규 3개)
- `supabase/migrations/031_news_benefit_tags.sql` — news_posts 에 benefit_tags 컬럼 + GIN 인덱스
- `supabase/migrations/032_normalize_welfare_categories.sql` — 비표준값 → BENEFIT_TAGS
- `supabase/migrations/033_normalize_loan_categories.sql` — 비표준값 → BENEFIT_TAGS

### 스크립트 (신규 1개)
- `scripts/retag-news-benefit-tags.ts` — news 11K건 일괄 enrich (1회)

### 라이브러리 (수정/신규)
- `lib/category-counts.ts` — **신규**. 페이지별 동적 카테고리 칩용 헬퍼 (DB count 조회)
- `lib/recommend.ts` — `getRelatedNews()`, `getRelatedBlogs()` 추가
- `lib/news-collectors/korea-kr.ts` 등 — 수집 시 benefit_tags 자동 채우기 (필요 시)

### UI 페이지 (수정 4개)
- `app/welfare/page.tsx` — 동적 카테고리 + 건수 표시
- `app/loan/page.tsx` — 동적 카테고리 + 건수 표시
- `app/news/page.tsx` — 토픽 필터 → benefit_tags 칩
- `app/blog/page.tsx` — 빈 카테고리 칩 숨김

### 통합 검색 (수정 2개)
- `app/api/search/route.ts` — news+blog 추가, 영역별 그룹 응답
- `components/search-box.tsx` — 자동완성에 news/blog 타입 배지 + BC

### 통합 추천 (수정 1개)
- `app/recommend/page.tsx` — 3섹션 결과 표시 (프로그램/뉴스/가이드)

---

## Task 1: news_posts.benefit_tags 컬럼 추가

**Files:**
- Create: `supabase/migrations/031_news_benefit_tags.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 031_news_benefit_tags.sql
-- news_posts 에 benefit_tags 배열 컬럼 추가 (BENEFIT_TAGS 14종 저장).
-- 기존 topic_categories 는 deprecated (코드 정리 후 별도 마이그레이션으로 제거).
-- ROLLBACK: ALTER TABLE news_posts DROP COLUMN benefit_tags;

ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS news_posts_benefit_tags_idx
  ON news_posts USING GIN (benefit_tags);

COMMENT ON COLUMN news_posts.benefit_tags IS
  'BENEFIT_TAGS 14종 (lib/tags/taxonomy.ts). retag-news-benefit-tags.ts 로 일괄 채움.';
```

- [ ] **Step 2: Supabase MCP 로 적용**

```
mcp__plugin_supabase_supabase__apply_migration
project_id: fpnaptuhulcggournikc
name: 031_news_benefit_tags
query: (위 SQL 전체)
```

기대: `Migration 031_news_benefit_tags applied successfully`

- [ ] **Step 3: 컬럼 추가 검증**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'news_posts' AND column_name = 'benefit_tags';
```

기대: `benefit_tags | ARRAY` 1행

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/031_news_benefit_tags.sql
git commit -m "feat(db): news_posts 에 benefit_tags 컬럼 추가 (031)"
git push
```

---

## Task 2: welfare 비표준 카테고리 정규화

**Files:**
- Create: `supabase/migrations/032_normalize_welfare_categories.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 032_normalize_welfare_categories.sql
-- welfare_programs.category 를 BENEFIT_TAGS 14종 안으로 정규화.
-- 비표준값: 소득(6133)·재난(223)·소상공인(2)·농업(1)
-- ROLLBACK: 본 마이그레이션은 비가역. 필요 시 raw_payload 에서 원본 복원 가능.

UPDATE welfare_programs SET category = '생계' WHERE category IN ('소득', '재난');
UPDATE welfare_programs SET category = '창업' WHERE category = '소상공인';
UPDATE welfare_programs SET category = '기타' WHERE category = '농업';
```

- [ ] **Step 2: 적용 + 검증**

apply 후 다음 쿼리:

```sql
SELECT category, COUNT(*) FROM welfare_programs
WHERE category NOT IN (
  '주거','의료','양육','교육','문화','취업','창업',
  '금융','생계','에너지','교통','장례','법률','기타'
) GROUP BY category;
```

기대: 0행 (모두 BENEFIT_TAGS 안)

- [ ] **Step 3: 분포 확인**

```sql
SELECT category, COUNT(*) FROM welfare_programs GROUP BY category ORDER BY 2 DESC;
```

기대: 생계(약 6356), 의료(1225), 양육(1053), 교육(657), 취업(456), 주거(296), 문화(138), 창업(2), 기타(1)

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/032_normalize_welfare_categories.sql
git commit -m "feat(db): welfare 비표준 카테고리 → BENEFIT_TAGS 정규화 (032)"
git push
```

---

## Task 3: loan 비표준 카테고리 정규화

**Files:**
- Create: `supabase/migrations/033_normalize_loan_categories.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 033_normalize_loan_categories.sql
-- loan_programs.category 를 BENEFIT_TAGS 14종 안으로 정규화.
-- "대출"·"금융"·"보증" → 모두 "금융" (의미 중복 제거).
-- ROLLBACK: 비가역.

UPDATE loan_programs SET category = '금융' WHERE category IN ('대출', '보증');
UPDATE loan_programs SET category = '창업' WHERE category IN ('창업지원', '소상공인지원');
UPDATE loan_programs SET category = '생계' WHERE category = '지원금';
```

- [ ] **Step 2: 적용 + 검증**

```sql
SELECT category, COUNT(*) FROM loan_programs
WHERE category NOT IN (
  '주거','의료','양육','교육','문화','취업','창업',
  '금융','생계','에너지','교통','장례','법률','기타'
) GROUP BY category;
```

기대: 0행

- [ ] **Step 3: 분포 확인**

```sql
SELECT category, COUNT(*) FROM loan_programs GROUP BY category ORDER BY 2 DESC;
```

기대: 금융(약 1336), 창업(약 211), 생계(24)

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/033_normalize_loan_categories.sql
git commit -m "feat(db): loan 비표준 카테고리 → BENEFIT_TAGS 정규화 (033)"
git push
```

---

## Task 4: news 11K건 benefit_tags 일괄 태깅 스크립트

**Files:**
- Create: `scripts/retag-news-benefit-tags.ts`

- [ ] **Step 1: 스크립트 작성**

```typescript
// scripts/retag-news-benefit-tags.ts
// news_posts 전체를 읽어 title+description 으로부터 benefit_tags 추출 후 저장.
// 1회성. 신규 컬렉터는 lib/news-collectors/* 에서 자동으로 채움 (Task 14).
//
// 실행:
//   npx tsx scripts/retag-news-benefit-tags.ts
//
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)

import { createClient } from "@supabase/supabase-js";
import { extractBenefitTags } from "../lib/tags/taxonomy";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("SUPABASE_URL/SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // press 제외 (목록 비노출 정책)
  const { count } = await supabase
    .from("news_posts")
    .select("id", { count: "exact", head: true })
    .neq("category", "press");

  console.log(`[retag] 대상 news_posts: ${count ?? 0} 건`);

  const PAGE = 200;
  let processed = 0;
  let updated = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("news_posts")
      .select("id, title, description")
      .neq("category", "press")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("[retag] select error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const text = `${row.title ?? ""} ${row.description ?? ""}`;
      const tags = extractBenefitTags(text);
      // 빈 결과("기타") 만 들어가더라도 저장 — 분포 파악에 필요
      const { error: upErr } = await supabase
        .from("news_posts")
        .update({ benefit_tags: tags })
        .eq("id", row.id);
      if (upErr) {
        console.error(`[retag] update ${row.id}:`, upErr.message);
      } else {
        updated++;
      }
      processed++;
    }

    if (processed % 1000 === 0 || data.length < PAGE) {
      console.log(`[retag] ${processed} / ${count ?? "?"} 처리, ${updated} 업데이트`);
    }
    from += PAGE;
    if (data.length < PAGE) break;
  }

  console.log(`[retag] 완료. 처리 ${processed}, 업데이트 ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 로컬 실행 (dry-run 없음, 직접 update — 안전한 추가 작업)**

```bash
npx tsx scripts/retag-news-benefit-tags.ts
```

기대 출력: `[retag] 대상 news_posts: 11363 건` → 진행률 → `[retag] 완료. 처리 11363, 업데이트 11363`

- [ ] **Step 3: 정합률 검증**

```sql
SELECT
  COUNT(*) FILTER (WHERE cardinality(benefit_tags) > 0) * 100.0 / COUNT(*) AS pct,
  COUNT(*) FILTER (WHERE cardinality(benefit_tags) > 0) AS tagged,
  COUNT(*) AS total
FROM news_posts WHERE category != 'press';
```

기대: pct >= 95% (extractBenefitTags 가 매칭 없으면 "기타" 를 넣으므로 사실상 100%)

```sql
SELECT unnest(benefit_tags) AS tag, COUNT(*)
FROM news_posts WHERE category != 'press'
GROUP BY tag ORDER BY 2 DESC;
```

기대: 14종 분포 출력 (생계·의료·양육 등)

- [ ] **Step 4: 커밋**

```bash
git add scripts/retag-news-benefit-tags.ts
git commit -m "feat(news): benefit_tags 일괄 태깅 스크립트 + 11K건 enrich"
git push
```

---

## Task 5: 동적 카테고리 헬퍼 (lib/category-counts.ts)

**Files:**
- Create: `lib/category-counts.ts`

UI 4페이지가 공통으로 쓸 "카테고리별 건수 조회" 헬퍼. DRY.

- [ ] **Step 1: 헬퍼 작성**

```typescript
// lib/category-counts.ts
// 페이지별 카테고리 칩 동적 노출용.
// DB 의 distinct category 를 count 와 함께 반환 → 빈 카테고리 자동 숨김.

import type { SupabaseClient } from "@supabase/supabase-js";
import { BENEFIT_TAGS, type BenefitTag } from "@/lib/tags/taxonomy";

export type CategoryCount = { category: string; n: number };

/** welfare/loan: 단일 category 컬럼. 활성 정책(만료 안된)만 카운트. */
export async function getProgramCategoryCounts(
  supabase: SupabaseClient,
  table: "welfare_programs" | "loan_programs",
): Promise<CategoryCount[]> {
  const today = new Date().toISOString().split("T")[0];
  let q = supabase
    .from(table)
    .select("category", { count: "exact", head: false });

  // welfare 만 apply_end 컬럼 있음. loan 은 없음.
  if (table === "welfare_programs") {
    q = q.or(`apply_end.gte.${today},apply_end.is.null`);
  }

  // distinct + count 는 PostgREST 에서 직접 안 되므로 group_by RPC 대신
  // 한 번에 최대 10000건 가져와 메모리에서 집계 (welfare 활성 ~10K, loan 1.5K).
  const { data } = await q.limit(15000);
  if (!data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ category: string }>) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  // BENEFIT_TAGS 순서 우선, 그 외(만일) 뒤에. 빈 카테고리는 자동 제외.
  const ordered: CategoryCount[] = [];
  for (const tag of BENEFIT_TAGS) {
    const n = counts.get(tag);
    if (n && n > 0) ordered.push({ category: tag, n });
  }
  for (const [category, n] of counts) {
    if (!(BENEFIT_TAGS as readonly string[]).includes(category)) {
      ordered.push({ category, n });
    }
  }
  return ordered;
}

/** news_posts.benefit_tags (배열) 별 건수. press 제외. */
export async function getNewsBenefitTagCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  // benefit_tags unnest 는 PostgREST 직접 불가 → 배치 fetch + 메모리 집계.
  const { data } = await supabase
    .from("news_posts")
    .select("benefit_tags")
    .neq("category", "press")
    .limit(20000);
  if (!data) return [];

  const counts = new Map<BenefitTag, number>();
  for (const row of data as Array<{ benefit_tags: string[] | null }>) {
    for (const t of row.benefit_tags ?? []) {
      counts.set(t as BenefitTag, (counts.get(t as BenefitTag) ?? 0) + 1);
    }
  }
  const ordered: CategoryCount[] = [];
  for (const tag of BENEFIT_TAGS) {
    const n = counts.get(tag);
    if (n && n > 0) ordered.push({ category: tag, n });
  }
  return ordered;
}

/** blog_posts.category 별 건수. published_at NOT NULL 만. */
export async function getBlogCategoryCounts(
  supabase: SupabaseClient,
): Promise<CategoryCount[]> {
  const { data } = await supabase
    .from("blog_posts")
    .select("category")
    .not("published_at", "is", null);
  if (!data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ category: string | null }>) {
    if (!row.category) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, n]) => ({ category, n }))
    .sort((a, b) => b.n - a.n);
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

기대: 컴파일 성공 (헬퍼만 추가, 호출처 없음 → 무영향)

- [ ] **Step 3: 커밋**

```bash
git add lib/category-counts.ts
git commit -m "feat(lib): 동적 카테고리 칩용 count 헬퍼 추가"
git push
```

---

## Task 6: app/welfare/page.tsx — 동적 카테고리 + 건수

**Files:**
- Modify: `app/welfare/page.tsx`

- [ ] **Step 1: import 추가 + CATEGORIES 제거**

`app/welfare/page.tsx` 상단:

```typescript
// 기존
import { FilterBar } from "./filter-bar";
import { Pagination } from "@/components/pagination";
import { getRegionMatchPatterns } from "@/lib/regions";

// 추가
import { getProgramCategoryCounts } from "@/lib/category-counts";
```

기존 라인 16 의 `const CATEGORIES = [...]` **삭제**.

- [ ] **Step 2: WelfarePage 안에서 동적 카운트 조회**

`const supabase = await createClient();` 다음 줄에 추가:

```typescript
const categoryCounts = await getProgramCategoryCounts(supabase, "welfare_programs");
```

- [ ] **Step 3: 카테고리 칩 렌더링 교체**

기존 (109~121 부근):

```tsx
<div className="flex gap-1.5 mb-4 flex-wrap">
  {CATEGORIES.map((c) => (
    <a
      key={c}
      href={buildUrl({ category: c, page: "1" })}
      className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
        category === c
          ? "bg-blue-500 text-white"
          : "bg-grey-50 text-grey-700 hover:bg-grey-100"
      }`}
    >
      {c}
    </a>
  ))}
</div>
```

→ 교체:

```tsx
<div className="flex gap-1.5 mb-4 flex-wrap">
  {/* "전체" 칩 — 항상 첫 자리 */}
  <a
    href={buildUrl({ category: "전체", page: "1" })}
    className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
      category === "전체"
        ? "bg-blue-500 text-white"
        : "bg-grey-50 text-grey-700 hover:bg-grey-100"
    }`}
  >
    전체
  </a>
  {categoryCounts.map((c) => (
    <a
      key={c.category}
      href={buildUrl({ category: c.category, page: "1" })}
      className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
        category === c.category
          ? "bg-blue-500 text-white"
          : "bg-grey-50 text-grey-700 hover:bg-grey-100"
      }`}
    >
      {c.category} <span className="opacity-70">({c.n.toLocaleString()})</span>
    </a>
  ))}
</div>
```

- [ ] **Step 4: 로컬 실행 검증**

```bash
npm run dev
```

브라우저로 `http://localhost:3000/welfare` 열고:
- 칩 라벨에 건수 표시되는지 (`주거 (296)` 형태)
- "교육"·"문화" 등 빠졌던 칩 노출되는지
- 칩 클릭 시 필터 정상 동작 + URL `?category=교육` 갱신

- [ ] **Step 5: 커밋**

```bash
git add app/welfare/page.tsx
git commit -m "feat(welfare): 카테고리 칩 동적 + 건수 표기"
git push
```

---

## Task 7: app/loan/page.tsx — 동적 카테고리 + 건수

**Files:**
- Modify: `app/loan/page.tsx`

- [ ] **Step 1: import + CATEGORIES 삭제**

```typescript
// 추가
import { getProgramCategoryCounts } from "@/lib/category-counts";
```

기존 16 행 `const CATEGORIES = [...]` 삭제.

- [ ] **Step 2: 동적 카운트 조회**

`const supabase = await createClient();` 다음에:

```typescript
const categoryCounts = await getProgramCategoryCounts(supabase, "loan_programs");
```

- [ ] **Step 3: 카테고리 칩 렌더링 교체**

(welfare 와 동일 패턴 — 위 Task 6 Step 3 의 JSX 코드를 그대로 복사하되, `categoryCounts` 변수명 그대로)

- [ ] **Step 4: 로컬 검증**

`http://localhost:3000/loan` — 칩이 "금융 (1336)", "창업 (211)", "생계 (24)" 정도로 줄어드는지.

- [ ] **Step 5: 커밋**

```bash
git add app/loan/page.tsx
git commit -m "feat(loan): 카테고리 칩 동적 + 건수 표기"
git push
```

---

## Task 8: app/news/page.tsx — 토픽 필터 → benefit_tags 칩

**Files:**
- Modify: `app/news/page.tsx`

- [ ] **Step 1: import 변경**

```typescript
// 제거
import { TOPIC_CATEGORIES } from "@/lib/news-collectors/korea-kr-topics";

// 추가
import { getNewsBenefitTagCounts } from "@/lib/category-counts";
```

`VALID_TOPICS` 상수도 본 task 에서는 일단 유지 (다음 단계 cleanup 으로 제거).

- [ ] **Step 2: searchParams 에 benefit 추가**

```typescript
type Props = {
  searchParams: Promise<{
    category?: string;
    topic?: string;     // deprecated. backwards compat 유지
    benefit?: string;   // 신규
    province?: string;
    page?: string;
  }>;
};
```

- [ ] **Step 3: benefit 파싱 + 쿼리 적용**

NewsIndexPage 안:

```typescript
const activeBenefit = params.benefit ?? null;
// (기존 activeTopic 파싱 로직은 유지 — backwards compat)

// 카운트 조회
const benefitCounts = await getNewsBenefitTagCounts(supabase);
```

쿼리 빌더에서 (기존 topic 필터 부근):

```typescript
if (activeBenefit) {
  query = query.contains("benefit_tags", [activeBenefit]);
}
```

- [ ] **Step 4: 토픽 필터 UI 를 benefit 칩으로 교체**

기존 토픽 필터 렌더링 부분을 찾아 (TOPIC_CATEGORIES.map 사용처) 다음으로 교체:

```tsx
<div className="flex gap-1.5 mb-4 flex-wrap">
  <a
    href="/news"
    className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
      !activeBenefit
        ? "bg-blue-500 text-white"
        : "bg-grey-50 text-grey-700 hover:bg-grey-100"
    }`}
  >
    전체
  </a>
  {benefitCounts.map((c) => (
    <a
      key={c.category}
      href={`/news?benefit=${encodeURIComponent(c.category)}`}
      className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
        activeBenefit === c.category
          ? "bg-blue-500 text-white"
          : "bg-grey-50 text-grey-700 hover:bg-grey-100"
      }`}
    >
      {c.category} <span className="opacity-70">({c.n.toLocaleString()})</span>
    </a>
  ))}
</div>
```

(기존 channel 칩 "전체/정책뉴스/정책자료" 는 그대로 유지 — 다른 축임)

- [ ] **Step 5: 로컬 검증**

`http://localhost:3000/news` — benefit 칩 노출, "주거" 클릭 시 주거 관련 뉴스만, URL `?benefit=주거`.

- [ ] **Step 6: 커밋**

```bash
git add app/news/page.tsx
git commit -m "feat(news): 토픽 필터 → benefit_tags 칩으로 교체"
git push
```

---

## Task 9: app/blog/page.tsx — 빈 카테고리 칩 숨김

**Files:**
- Modify: `app/blog/page.tsx`

- [ ] **Step 1: import + CATEGORIES 동적화**

기존 26~35 행의 정적 CATEGORIES 배열 삭제. import 추가:

```typescript
import { getBlogCategoryCounts } from "@/lib/category-counts";
```

- [ ] **Step 2: 동적 카운트 조회**

BlogIndexPage 함수 안, `const supabase = await createClient();` 다음:

```typescript
const categoryCounts = await getBlogCategoryCounts(supabase);
```

- [ ] **Step 3: 칩 렌더링 교체**

기존 "CATEGORIES.map" 부분을 찾아 다음으로 교체 (welfare/loan 패턴과 동일하되 활성 비교 로직만 다름):

```tsx
<div className="flex gap-1.5 mb-4 flex-wrap">
  <a
    href="/blog"
    className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
      activeCategory === "all"
        ? "bg-blue-500 text-white"
        : "bg-grey-50 text-grey-700 hover:bg-grey-100"
    }`}
  >
    전체
  </a>
  {categoryCounts.map((c) => (
    <a
      key={c.category}
      href={`/blog?category=${encodeURIComponent(c.category)}`}
      className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
        activeCategory === c.category
          ? "bg-blue-500 text-white"
          : "bg-grey-50 text-grey-700 hover:bg-grey-100"
      }`}
    >
      {c.category} <span className="opacity-70">({c.n})</span>
    </a>
  ))}
</div>
```

- [ ] **Step 4: 로컬 검증**

`http://localhost:3000/blog` — 칩이 4개만 (청년 4, 노년 2, 학생·교육 1, 소상공인 1). 빈 카테고리 사라짐.

- [ ] **Step 5: 커밋**

```bash
git add app/blog/page.tsx
git commit -m "feat(blog): 빈 카테고리 칩 동적 숨김"
git push
```

---

## Task 10: /api/search — news + blog 추가, 영역별 그룹

**Files:**
- Modify: `app/api/search/route.ts`

- [ ] **Step 1: 응답 구조 확장 + BC 유지**

`app/api/search/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { results: [], welfare: [], loan: [], news: [], blog: [], total: 0,
        error: "검색어는 2글자 이상 입력해주세요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const sanitized = q.trim().replace(/[%_\\]/g, "\\$&");

  const [
    { data: welfare },
    { data: loans },
    { data: news },
    { data: blogs },
  ] = await Promise.all([
    supabase
      .from("welfare_programs")
      .select("*")
      .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`)
      .order("view_count", { ascending: false })
      .limit(10),
    supabase
      .from("loan_programs")
      .select("*")
      .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,category.ilike.%${sanitized}%`)
      .order("view_count", { ascending: false })
      .limit(10),
    supabase
      .from("news_posts")
      .select("id, slug, title, summary, ministry, published_at, category")
      .neq("category", "press")
      .or(`title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`)
      .order("published_at", { ascending: false })
      .limit(8),
    supabase
      .from("blog_posts")
      .select("slug, title, meta_description, category, published_at, cover_image, reading_time_min")
      .not("published_at", "is", null)
      .or(`title.ilike.%${sanitized}%,meta_description.ilike.%${sanitized}%`)
      .order("published_at", { ascending: false })
      .limit(5),
  ]);

  const welfareDisplay = (welfare || []).map(welfareToDisplay);
  const loanDisplay = (loans || []).map(loanToDisplay);
  const newsList = news || [];
  const blogList = blogs || [];

  // BC: 기존 호출처(SearchBox)가 results 평탄 배열을 기대 → 유지.
  // 확장 호출처는 영역별 키 사용.
  const results = [...welfareDisplay, ...loanDisplay];

  return NextResponse.json({
    results,                        // BC (welfare + loan only)
    welfare: welfareDisplay,
    loan: loanDisplay,
    news: newsList,
    blog: blogList,
    total: welfareDisplay.length + loanDisplay.length + newsList.length + blogList.length,
  });
}
```

- [ ] **Step 2: 로컬 검증**

```bash
curl 'http://localhost:3000/api/search?q=주거' | jq
```

기대: `welfare/loan/news/blog/total` 키 모두 응답. results 키는 BC 로 welfare+loan 평탄.

- [ ] **Step 3: 커밋**

```bash
git add app/api/search/route.ts
git commit -m "feat(search): news+blog 추가, 영역별 응답 그룹화 (BC 유지)"
git push
```

---

## Task 11: SearchBox 자동완성 — news/blog 배지 추가

**Files:**
- Modify: `components/search-box.tsx`

- [ ] **Step 1: SuggestItem 타입 확장**

기존 22~27 행:

```typescript
type SuggestItem = {
  id: string;
  title: string;
  type: "welfare" | "loan";
  category: string;
};
```

→ 교체 (news/blog 추가하지 않고 기존 5개 자동완성은 welfare+loan 만 유지. 사용자 통합 결과는 검색 실행 후 페이지에서 보게 한다 — 자동완성 UI 복잡도 통제.)

**본 task 는 변경 없음** — Task 10 의 BC 처리로 SearchBox 는 그대로 동작. 본 step 은 검증만.

- [ ] **Step 2: 검증**

`http://localhost:3000/` 헤더에서 "주거" 입력 → 5건 자동완성 (welfare+loan) 정상 동작.

- [ ] **Step 3: (변경 없으므로) 커밋 스킵**

본 task 는 사실상 검증만. 다음 task 로 진행.

---

## Task 12: /recommend — 관련 뉴스·가이드 함수 추가

**Files:**
- Modify: `lib/recommend.ts`

- [ ] **Step 1: getRelatedNews / getRelatedBlogs 추가**

`lib/recommend.ts` 파일 **맨 아래**에 추가:

```typescript
// ─────────────────────────────────────────────────────────────
// 통합 추천: 관련 뉴스 / 가이드 글
// /recommend 페이지 3섹션 결과용. 사용자 프로필(연령/지역/직업) 기반
// 단순 매칭 (BENEFIT_TAGS occupation_keyword 활용).
// ─────────────────────────────────────────────────────────────
import type { BenefitTag } from "@/lib/tags/taxonomy";

// 직업·연령 → 우선 매칭할 BENEFIT_TAGS 후보군
function inferBenefitTagsFromProfile(
  age: AgeOption | null,
  occupation: OccupationOption | null,
): BenefitTag[] {
  const tags: BenefitTag[] = [];
  if (age === "20대" || age === "30대") tags.push("주거", "취업", "교육");
  if (age === "40대" || age === "50대") tags.push("양육", "교육", "의료");
  if (age === "60대" || age === "70대 이상") tags.push("의료", "생계", "장례");
  if (occupation === "자영업자" || occupation === "소상공인") tags.push("창업", "금융");
  if (occupation === "직장인") tags.push("주거", "양육");
  if (occupation === "구직자" || occupation === "취업준비생") tags.push("취업", "생계");
  if (occupation === "주부") tags.push("양육", "의료");
  if (tags.length === 0) tags.push("생계", "주거"); // 폴백
  return Array.from(new Set(tags)).slice(0, 5);
}

export async function getRelatedNews(opts: {
  age: AgeOption | null;
  region: RegionOption | null;
  occupation: OccupationOption | null;
  limit?: number;
}) {
  const supabase = await createClient();
  const tags = inferBenefitTagsFromProfile(opts.age, opts.occupation);
  const { data } = await supabase
    .from("news_posts")
    .select("id, slug, title, summary, ministry, published_at, category, benefit_tags")
    .neq("category", "press")
    .overlaps("benefit_tags", tags)
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 6);
  return data ?? [];
}

export async function getRelatedBlogs(opts: {
  age: AgeOption | null;
  occupation: OccupationOption | null;
  limit?: number;
}) {
  const supabase = await createClient();
  // blog 는 인구통계 카테고리 — 직업·연령에 직접 매핑.
  const candidates: string[] = [];
  if (opts.age === "20대" || opts.age === "30대") candidates.push("청년");
  if (opts.age === "60대" || opts.age === "70대 이상") candidates.push("노년");
  if (opts.occupation === "자영업자" || opts.occupation === "소상공인")
    candidates.push("소상공인");
  if (candidates.length === 0) candidates.push("큐레이션");

  const { data } = await supabase
    .from("blog_posts")
    .select("slug, title, meta_description, category, published_at, cover_image, reading_time_min")
    .not("published_at", "is", null)
    .in("category", candidates)
    .order("published_at", { ascending: false })
    .limit(opts.limit ?? 4);
  return data ?? [];
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -10
```

기대: 컴파일 성공.

- [ ] **Step 3: 커밋**

```bash
git add lib/recommend.ts
git commit -m "feat(recommend): 관련 뉴스·가이드 매칭 함수 추가"
git push
```

---

## Task 13: app/recommend/page.tsx — 3섹션 결과 화면

**Files:**
- Modify: `app/recommend/page.tsx`

- [ ] **Step 1: import + 데이터 호출 추가**

기존 import 옆에:

```typescript
import { getRelatedNews, getRelatedBlogs } from "@/lib/recommend";
import { NewsCard } from "@/components/news-card";
import { BlogCard } from "@/components/blog-card";
```

3필드(age/region/occupation) 모두 채워졌을 때 추천 호출하는 부분 (`getRecommendations` 호출 근처) 에 병렬 추가:

```typescript
const [recommendations, relatedNews, relatedBlogs] = candidateAge && candidateRegion && candidateOcc
  ? await Promise.all([
      getRecommendations({ age: candidateAge as AgeOption, region: candidateRegion as RegionOption, district: candidateDistrict, occupation: candidateOcc as OccupationOption, type: candidateType }),
      getRelatedNews({ age: candidateAge as AgeOption, region: candidateRegion as RegionOption, occupation: candidateOcc as OccupationOption }),
      getRelatedBlogs({ age: candidateAge as AgeOption, occupation: candidateOcc as OccupationOption }),
    ])
  : [null, [], []];
```

(기존 `getRecommendations` 단독 호출 부분을 위 형태로 교체. 정확한 변수명·반환구조는 기존 파일 확인 필수.)

- [ ] **Step 2: JSX 에 뉴스·가이드 섹션 추가**

기존 추천 결과 렌더링 끝부분에:

```tsx
{relatedNews.length > 0 && (
  <section className="max-w-content mx-auto px-10 mt-12 max-md:px-6">
    <h2 className="text-[22px] font-bold text-grey-900 mb-4">관련 정책 뉴스</h2>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {relatedNews.map((n) => (
        <NewsCard key={n.id} item={n as any} />
      ))}
    </div>
  </section>
)}
{relatedBlogs.length > 0 && (
  <section className="max-w-content mx-auto px-10 mt-12 mb-10 max-md:px-6">
    <h2 className="text-[22px] font-bold text-grey-900 mb-4">함께 보면 좋은 가이드</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {relatedBlogs.map((b) => (
        <BlogCard key={b.slug} item={b as any} />
      ))}
    </div>
  </section>
)}
```

(NewsCard / BlogCard 의 정확한 prop 명·타입은 컴포넌트 파일에서 재확인 필요)

- [ ] **Step 3: 로컬 검증**

`http://localhost:3000/recommend?age=30대&region=서울&occupation=직장인` — 3섹션(추천 / 관련 뉴스 / 가이드) 모두 노출되는지.

- [ ] **Step 4: 커밋**

```bash
git add app/recommend/page.tsx
git commit -m "feat(recommend): 관련 뉴스·가이드 3섹션 결과 화면"
git push
```

---

## Task 14: 컬렉터 정합성 — 신규 수집분 자동 정규화

**Files:**
- Modify: `lib/news-collectors/korea-kr.ts`, `lib/news-collectors/naver-news.ts` (있는 경우)

목적: 신규 news 수집 시 benefit_tags 가 빈 채로 저장되지 않도록.

- [ ] **Step 1: 컬렉터 위치 확인**

```bash
grep -rln "news_posts" lib/news-collectors/ 2>/dev/null
```

- [ ] **Step 2: 각 collector 의 insert/upsert 부근에 benefit_tags 자동 채우기 추가**

패턴 (각 컬렉터 파일에서):

```typescript
import { extractBenefitTags } from "@/lib/tags/taxonomy";

// insert payload 구성 시:
const payload = {
  // ... 기존 필드
  benefit_tags: extractBenefitTags(`${title} ${description ?? ""}`),
};
```

- [ ] **Step 3: 다음 cron 1회 실행 후 검증**

새로 수집된 row 의 benefit_tags 가 비어있지 않은지:

```sql
SELECT id, title, benefit_tags
FROM news_posts
WHERE published_at >= NOW() - INTERVAL '6 hours'
  AND category != 'press'
ORDER BY published_at DESC LIMIT 20;
```

- [ ] **Step 4: 컬렉터 정합성 — welfare/loan 도 동일 점검**

```bash
grep -rln "welfare_programs" lib/ 2>/dev/null | grep -i collect
grep -rln "loan_programs" lib/ 2>/dev/null | grep -i collect
```

각 insert 위치에서 비표준 카테고리 들어가는지 확인. 들어가면 Task 2/3 의 매핑 적용:

```typescript
const RAW_TO_STD: Record<string, string> = {
  "소득": "생계", "재난": "생계",
  "소상공인": "창업", "농업": "기타",
  "대출": "금융", "보증": "금융",
  "창업지원": "창업", "소상공인지원": "창업",
  "지원금": "생계",
};
const normalizedCategory = RAW_TO_STD[rawCategory] ?? rawCategory;
```

- [ ] **Step 5: 커밋**

```bash
git add lib/news-collectors/ lib/<collector_files>
git commit -m "feat(collectors): 신규 수집분 카테고리·benefit_tags 자동 정규화"
git push
```

---

## Task 15: 전체 검증 (SQL + UI smoke)

검증 전용 task. 코드 변경 없음.

- [ ] **Step 1: 카테고리 정합성 SQL**

```sql
-- 1) welfare 모든 category 가 BENEFIT_TAGS 안인지
SELECT category, COUNT(*) FROM welfare_programs
WHERE category NOT IN (
  '주거','의료','양육','교육','문화','취업','창업',
  '금융','생계','에너지','교통','장례','법률','기타'
) GROUP BY category;
-- 기대: 0행

-- 2) loan 동일
SELECT category, COUNT(*) FROM loan_programs
WHERE category NOT IN (
  '주거','의료','양육','교육','문화','취업','창업',
  '금융','생계','에너지','교통','장례','법률','기타'
) GROUP BY category;
-- 기대: 0행

-- 3) news benefit_tags 정합률
SELECT
  COUNT(*) FILTER (WHERE cardinality(benefit_tags) > 0) * 100.0 / COUNT(*) AS pct
FROM news_posts WHERE category != 'press';
-- 기대: >= 95%
```

- [ ] **Step 2: UI smoke (수동, 5분)**

`npm run dev` 후 다음 시나리오:

| 페이지 | 확인 |
|---|---|
| `/welfare` | 칩이 8~9개로 늘어났는지, "교육 (657)" 클릭하면 657건 결과 |
| `/loan` | 칩이 3~4개로 줄었는지, "금융 (~1336)" 클릭하면 결과 |
| `/news` | benefit 칩 노출, "주거" 클릭하면 주거 뉴스만 |
| `/blog` | 빈 칩 안 보이는지 (4개만) |
| `/api/search?q=주거` | welfare/loan/news/blog 4 영역 모두 응답 |
| `/recommend?age=30대&region=서울&occupation=직장인` | 3섹션(추천·뉴스·가이드) 노출 |

- [ ] **Step 3: 알림 매칭 sanity check**

기존 alert_rules 가 카테고리 변경 후에도 정상 매칭되는지:

```sql
-- 사용자가 alert_rules 에 등록한 keyword·category 분포
SELECT category, COUNT(*) FROM alert_rules GROUP BY category;
```

비표준값이 alert_rules 에 남아있다면 동일 정규화 한 번 적용:

```sql
UPDATE alert_rules SET category = '생계' WHERE category IN ('소득', '재난');
UPDATE alert_rules SET category = '금융' WHERE category IN ('대출', '보증');
-- (필요 시 추가)
```

- [ ] **Step 4: 검증 완료 commit (변경 없으면 스킵)**

만약 alert_rules 정규화 SQL 적용했으면:

```bash
# supabase/migrations/034_normalize_alert_rules_categories.sql 작성 후
git add supabase/migrations/034_normalize_alert_rules_categories.sql
git commit -m "feat(db): alert_rules 카테고리 정규화 (034)"
git push
```

---

## Task 16: 최종 정리·문서 갱신

- [ ] **Step 1: CHANGELOG / project memory 갱신 (수동)**

작업 사장님과 공유:
- 어떤 카테고리가 어떻게 매핑됐는지
- 통합 검색·추천 새 기능
- 알림 정확도 자동 향상

- [ ] **Step 2: 메모리 업데이트 알림**

다음 정보를 사장님께 전달:
- 분류 통일 완료 시점
- benefit_tags 정합률 결과 수치
- 검증 완료 항목 체크리스트

- [ ] **Step 3: 모니터링 대상**

향후 1주일간 watch:
- 신규 수집분 benefit_tags 비어있지 않은지 (cron 직후)
- 알림 발송 정확도 (사용자 피드백)
- /recommend 결과의 뉴스/가이드 섹션 클릭률 (GA4)

---

## 검증 체크리스트 (PR 클로즈 전 필수)

- [ ] 모든 마이그레이션 적용 후 비표준 카테고리 0건
- [ ] news benefit_tags 정합률 >= 95%
- [ ] /welfare, /loan, /news, /blog 칩 모두 동적 노출 + 건수 표기
- [ ] /api/search 응답에 welfare/loan/news/blog 4 영역 키 존재
- [ ] /recommend 페이지에서 3섹션 결과 노출
- [ ] SearchBox 자동완성 BC 정상 (welfare/loan 5건)
- [ ] alert_rules 카테고리 정합 (필요 시 정규화)
- [ ] 컬렉터에서 신규 수집분 benefit_tags 자동 채워짐 (다음 cron 후 SQL 확인)
