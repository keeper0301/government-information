# Homepage Personalized Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the homepage into a personalized dashboard that leads with trusted mypage-based recommendations, then supports direct exploration and data freshness confidence.

**Architecture:** Keep the homepage as a server-rendered App Router page. Split the upgrade into focused server components: one data helper for personalized preview items, one hero preview component, one discovery hub wrapper, and one compact trust strip. Reuse existing personalization scoring and shared eligibility gates rather than creating a new recommendation engine.

**Tech Stack:** Next.js 16 App Router, React Server Components, Supabase server client, Vitest, TypeScript, Tailwind CSS.

---

## File Structure

- Modify: `components/home-recommend-auto.tsx`
  - Narrow its responsibility to a personalized preview card with match reasons.
  - Export pure helpers for reason labels so they can be tested.
- Create: `components/home-discovery-hub.tsx`
  - Layout wrapper around target cards, region map, alert strip, and popular picks row.
- Create: `components/home-trust-strip.tsx`
  - Compact freshness/count/source confidence strip.
- Modify: `app/page.tsx`
  - Update hero copy and CTA logic.
  - Replace scattered discovery sections with `HomeDiscoveryHub`.
  - Add `HomeTrustStrip`.
  - Keep below-the-fold data under `Suspense`.
- Create: `__tests__/components/home-recommend-auto.test.tsx`
  - Unit tests for match reason labels and ineligible policy filtering expectations through the existing score engine.
- Create: `__tests__/components/home-trust-strip.test.tsx`
  - Unit tests for freshness display helpers.

---

### Task 1: Add Match Reason Labels To Homepage Recommendations

**Files:**
- Modify: `components/home-recommend-auto.tsx`
- Test: `__tests__/components/home-recommend-auto.test.tsx`

- [ ] **Step 1: Write the failing test for match reason labels**

Create `__tests__/components/home-recommend-auto.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { getHomeMatchReasonLabels } from "@/components/home-recommend-auto";
import type { MatchSignal } from "@/lib/personalization/types";

describe("getHomeMatchReasonLabels", () => {
  it("maps scoring signals to compact Korean reason labels", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "income_target", score: 4, detail: "low" },
      { kind: "household_target", score: 3, detail: "single_parent" },
      { kind: "benefit_tags", score: 3, detail: "의료" },
      { kind: "urgent_deadline", score: 1 },
    ];

    expect(getHomeMatchReasonLabels(signals)).toEqual([
      "지역",
      "소득",
      "가구",
      "관심분야",
      "마감임박",
    ]);
  });

  it("deduplicates labels and caps the visible reasons", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "benefit_tags", score: 3, detail: "주거" },
      { kind: "benefit_tags", score: 3, detail: "의료" },
      { kind: "occupation", score: 2 },
      { kind: "age", score: 1 },
    ];

    expect(getHomeMatchReasonLabels(signals)).toEqual([
      "지역",
      "관심분야",
      "직업",
      "연령",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-recommend-auto.test.tsx
```

Expected: FAIL because `getHomeMatchReasonLabels` is not exported yet.

- [ ] **Step 3: Implement the match reason helper**

Modify `components/home-recommend-auto.tsx` imports:

```tsx
import type { MatchSignal } from '@/lib/personalization/types';
```

Add this helper near the top of `components/home-recommend-auto.tsx`:

```tsx
const HOME_MATCH_REASON_LABELS: Partial<Record<MatchSignal["kind"], string>> = {
  region: "지역",
  district: "지역",
  benefit_tags: "관심분야",
  occupation: "직업",
  age: "연령",
  income_keyword: "소득",
  income_target: "소득",
  household_keyword: "가구",
  household_target: "가구",
  urgent_deadline: "마감임박",
  business_match: "사업자",
};

export function getHomeMatchReasonLabels(signals: MatchSignal[], limit = 4): string[] {
  const labels: string[] = [];
  for (const signal of signals) {
    const label = HOME_MATCH_REASON_LABELS[signal.kind];
    if (!label || labels.includes(label)) continue;
    labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-recommend-auto.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add components/home-recommend-auto.tsx __tests__/components/home-recommend-auto.test.tsx
git commit -m "Add homepage recommendation reason labels"
```

---

### Task 2: Render Personalized Preview With Reasons And Trust Copy

**Files:**
- Modify: `components/home-recommend-auto.tsx`
- Test: `__tests__/components/home-recommend-auto.test.tsx`

- [ ] **Step 1: Add a failing safety test for income mismatch through the preview scoring path**

Append to `__tests__/components/home-recommend-auto.test.tsx`:

```tsx
import { scoreProgram, type ScorableItem } from "@/lib/personalization/score";
import type { UserSignals } from "@/lib/personalization/types";

describe("homepage personalized preview scoring safety", () => {
  it("does not let income-mismatched policies pass by interest tags alone", () => {
    const user: UserSignals = {
      ageGroup: null,
      region: null,
      district: null,
      occupation: null,
      incomeLevel: "high",
      householdTypes: [],
      benefitTags: ["의료"] as UserSignals["benefitTags"],
      hasChildren: null,
      merit: null,
      businessProfile: null,
    };
    const item: ScorableItem = {
      id: "medical-aid",
      title: "의료급여(요양비)",
      description: "의료급여 수급권자에게 의료비를 지원합니다.",
      region: null,
      benefit_tags: ["의료"],
      source: "보건복지부",
      apply_end: null,
      income_target_level: null,
      household_target_tags: [],
    };

    expect(scoreProgram(item, user).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-recommend-auto.test.tsx
```

Expected: PASS if the existing income gate is still working. If it fails, stop and fix `lib/personalization/score.ts` before continuing.

- [ ] **Step 3: Render match reasons in each recommended row**

In `components/home-recommend-auto.tsx`, change:

```tsx
{items.map(({ item }) => (
```

to:

```tsx
{items.map(({ item, signals }) => {
  const reasons = getHomeMatchReasonLabels(signals);
  return (
```

Replace the `<li>` block with:

```tsx
<li key={item.id}>
  <Link
    href={`/welfare/${item.id}`}
    className="block py-2.5 px-3 rounded-xl hover:bg-grey-50 transition no-underline"
  >
    <div className="text-sm max-md:text-[15px] font-semibold text-grey-900 line-clamp-2">
      {item.title}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
        >
          {reason}
        </span>
      ))}
      {item.apply_end && (
        <span className="text-[11px] font-medium text-grey-500">
          마감 {item.apply_end}
        </span>
      )}
    </div>
  </Link>
</li>
  );
})}
```

Add a trust line below the heading block:

```tsx
<p className="mb-4 text-[13px] leading-[1.5] text-grey-600">
  마이페이지의 지역·소득·가구 정보를 기준으로 부적합한 정책을 걸러냈어요.
</p>
```

- [ ] **Step 4: Update the empty result copy**

In the `items.length === 0` fallback, replace the paragraph with:

```tsx
<p className="text-sm max-md:text-[15px] text-grey-600 leading-[1.6] mb-4">
  지금은 마이페이지 조건에 맞는 새 정책이 적어요.
  <br />
  소득·가구 정보를 보완하면 더 정확하게 걸러드릴게요.
</p>
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-recommend-auto.test.tsx __tests__/personalization/income-gate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add components/home-recommend-auto.tsx __tests__/components/home-recommend-auto.test.tsx
git commit -m "Show trust reasons in homepage recommendations"
```

---

### Task 3: Add A Discovery Hub Wrapper

**Files:**
- Create: `components/home-discovery-hub.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the discovery hub component**

Create `components/home-discovery-hub.tsx`:

```tsx
import { Suspense, type ReactNode } from "react";
import { HomeTargetCards } from "@/components/home-target-cards";
import { RevealOnScroll } from "@/components/reveal-on-scroll";

export function HomeDiscoveryHub({
  regionMap,
  alertStrip,
  popularPicks,
}: {
  regionMap: ReactNode;
  alertStrip: ReactNode;
  popularPicks: ReactNode;
}) {
  return (
    <section aria-labelledby="home-discovery-title" className="bg-white">
      <div className="max-w-content mx-auto px-10 pt-16 max-md:px-6 max-md:pt-12">
        <div className="mb-8">
          <p className="text-[13px] font-bold text-blue-500 mb-2">
            정책 탐색 허브
          </p>
          <h2
            id="home-discovery-title"
            className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.8px] text-grey-900"
          >
            맞춤 추천 다음은 직접 골라보세요
          </h2>
          <p className="mt-3 max-w-[620px] text-[15px] leading-[1.7] text-grey-600">
            복지·대출·지역·대상·마감임박 정책을 한 흐름에서 확인할 수 있어요.
          </p>
        </div>
      </div>

      <HomeTargetCards />

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[600px]" aria-hidden />}>
          {regionMap}
        </Suspense>
      </RevealOnScroll>

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[60px]" aria-hidden />}>
          {alertStrip}
        </Suspense>
      </RevealOnScroll>

      <RevealOnScroll>
        <Suspense fallback={<div className="h-[260px]" aria-hidden />}>
          {popularPicks}
        </Suspense>
      </RevealOnScroll>
    </section>
  );
}
```

- [ ] **Step 2: Import the discovery hub in `app/page.tsx`**

Add:

```tsx
import { HomeDiscoveryHub } from "@/components/home-discovery-hub";
```

- [ ] **Step 3: Replace the scattered target/region/alert/popular sections**

Remove these standalone blocks from `app/page.tsx`:

```tsx
<HomeTargetCards />
```

and the separate `RegionMap`, `AlertStripSection`, and `PopularPicksRowSection` `RevealOnScroll` blocks.

Insert after the fixed popular sidebar:

```tsx
<HomeDiscoveryHub
  regionMap={<RegionMap />}
  alertStrip={<AlertStripSection isLoggedIn={!!user} />}
  popularPicks={<PopularPicksRowSection />}
/>
```

- [ ] **Step 4: Remove unused imports**

If `HomeTargetCards` is no longer referenced directly in `app/page.tsx`, remove:

```tsx
import { HomeTargetCards } from "@/components/home-target-cards";
```

- [ ] **Step 5: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: PASS with no unused import errors.

- [ ] **Step 6: Commit Task 3**

```powershell
git add app/page.tsx components/home-discovery-hub.tsx
git commit -m "Group homepage discovery sections"
```

---

### Task 4: Add Compact Trust And Freshness Strip

**Files:**
- Create: `components/home-trust-strip.tsx`
- Create: `__tests__/components/home-trust-strip.test.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write tests for trust strip helper copy**

Create `__tests__/components/home-trust-strip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { buildFreshnessLabel } from "@/components/home-trust-strip";

describe("buildFreshnessLabel", () => {
  it("uses a fallback when freshness is unavailable", () => {
    expect(buildFreshnessLabel(null)).toBe("수집 상태 확인 중");
  });

  it("formats recent freshness in minutes", () => {
    expect(buildFreshnessLabel(12)).toBe("12분 전 업데이트");
  });

  it("formats older freshness in hours", () => {
    expect(buildFreshnessLabel(180)).toBe("3시간 전 업데이트");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-trust-strip.test.tsx
```

Expected: FAIL because `components/home-trust-strip.tsx` does not exist.

- [ ] **Step 3: Implement `HomeTrustStrip`**

Create `components/home-trust-strip.tsx`:

```tsx
import { getDataFreshness } from "@/lib/data-freshness";
import { getProgramCounts } from "@/lib/home-stats";

export function buildFreshnessLabel(minutesAgo: number | null): string {
  if (minutesAgo === null) return "수집 상태 확인 중";
  if (minutesAgo < 60) return `${minutesAgo}분 전 업데이트`;
  const hours = Math.floor(minutesAgo / 60);
  return `${hours}시간 전 업데이트`;
}

export async function HomeTrustStrip() {
  const [counts, freshness] = await Promise.all([
    getProgramCounts(),
    getDataFreshness(),
  ]);
  const todayNew = counts.today_new_welfare + counts.today_new_loan;
  const weekNew = counts.week_new_welfare + counts.week_new_loan;

  return (
    <section className="max-w-content mx-auto px-10 py-10 max-md:px-6">
      <div className="grid gap-4 rounded-2xl border border-grey-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_1.2fr] md:p-6">
        <TrustMetric label="오늘 신규 정책" value={`${todayNew.toLocaleString()}건`} />
        <TrustMetric label="이번 주 신규 정책" value={`${weekNew.toLocaleString()}건`} />
        <div>
          <div className="text-[13px] font-semibold text-grey-500">
            데이터 신뢰 흐름
          </div>
          <div className="mt-1 text-[15px] font-bold text-grey-900">
            수집 → 조건 필터링 → 알림 발송
          </div>
          <div className="mt-1 text-[13px] text-grey-600">
            {buildFreshnessLabel(freshness.minutes_ago)}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-grey-500">{label}</div>
      <div className="mt-1 text-[24px] font-extrabold tracking-[-0.6px] text-blue-500">
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the trust strip test**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-trust-strip.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add `HomeTrustStrip` to `app/page.tsx`**

Import:

```tsx
import { HomeTrustStrip } from "@/components/home-trust-strip";
```

Insert after `HomeDiscoveryHub`:

```tsx
<RevealOnScroll>
  <Suspense fallback={<div className="h-[150px]" aria-hidden />}>
    <HomeTrustStrip />
  </Suspense>
</RevealOnScroll>
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd run test -- __tests__/components/home-trust-strip.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add app/page.tsx components/home-trust-strip.tsx __tests__/components/home-trust-strip.test.tsx
git commit -m "Add homepage trust freshness strip"
```

---

### Task 5: Update Hero Copy And CTA States

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the hero headline and supporting copy**

In `app/page.tsx`, replace:

```tsx
내 조건에 맞는 정부 지원,
<br />
30초 만에 찾아드릴게요
```

with:

```tsx
내 조건에 맞는 정책만
<br />
먼저 보여드릴게요
```

Replace the hero paragraph with:

```tsx
지역·소득·가구·직업 정보를 기준으로 맞지 않는 정책은 줄이고,
<br />
마감 전에 확인해야 할 지원사업을 먼저 보여드려요.
```

- [ ] **Step 2: Make the primary CTA profile-aware**

Replace the current CTA block's first `Link` with:

```tsx
<Link
  href={user ? (isProfileEmpty ? "/mypage" : "/recommend") : "/quiz"}
  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-blue-500 text-white text-[15px] font-bold hover:bg-blue-600 transition-colors no-underline shadow-[0_4px_12px_rgba(49,130,246,0.25)] min-h-[48px]"
>
  {user ? (isProfileEmpty ? "마이페이지 보완하기" : "내 맞춤 정책 전체 보기") : "내 정책 1분 진단"}
  <span aria-hidden="true">→</span>
</Link>
```

Keep the secondary `/welfare` CTA.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 4: Commit Task 5**

```powershell
git add app/page.tsx
git commit -m "Update homepage hero for personalized dashboard"
```

---

### Task 6: Final Verification

**Files:**
- No direct edits unless verification reveals a bug.

- [ ] **Step 1: Run all linting**

Run:

```powershell
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 2: Run all tests**

Run:

```powershell
npm.cmd run test
```

Expected: all test files pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: build completes successfully. Existing Next edge runtime warning is acceptable if unchanged.

- [ ] **Step 4: Inspect git diff**

Run:

```powershell
git status --short --branch
git log --oneline -6
```

Expected: working tree clean after task commits, with the homepage dashboard commits on top.

- [ ] **Step 5: Push after successful verification**

Run:

```powershell
git push origin master
```

Expected: `master -> master` push succeeds.
