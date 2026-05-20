# Policy Personalization Loop Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the existing homepage recommendation reason and profile completion logic into reusable personalization helpers while preserving current homepage behavior.

**Architecture:** Keep scoring in `lib/personalization/*`. Move pure label/profile-summary logic out of `components/home-recommend-auto.tsx` into focused helpers, then let the homepage import wrappers from those helpers. Add a small presentational reason-chip component that can be reused by the later notification-history inbox slice without importing the full homepage server component.

**Tech Stack:** Next.js App Router, React Server Components by default, TypeScript, Vitest.

---

## File Structure

- Create `lib/personalization/reason-labels.ts`
  - Owns pure `MatchSignal` to Korean label mapping.
  - Exports `getMatchReasonLabels`.
  - Exports `getRecommendationConfidenceLabel`.
- Create `lib/personalization/profile-completion.ts`
  - Owns pure `UserSignals` completion summary logic.
  - Exports `getProfileCompletionSummary`.
- Create `components/personalization/recommendation-reason-chips.tsx`
  - Renders static reason chips from `MatchSignal[]`.
  - Contains no client-only APIs and no server data fetching.
- Modify `components/home-recommend-auto.tsx`
  - Reuse the shared helpers.
  - Keep existing exported function names for current tests and callers.
  - Replace inline reason chip rendering with `RecommendationReasonChips`.
- Add `__tests__/lib/personalization-reason-labels.test.ts`
  - Verifies the shared label helper has stable default labels for notification-history reuse.
- Add `__tests__/lib/profile-completion.test.ts`
  - Verifies profile completion summary can be tested without importing the homepage component.
- Update `__tests__/components/home-recommend-auto.test.tsx`
  - Keep homepage wrapper behavior covered.

## Task 1: Shared Recommendation Reason Helpers

**Files:**
- Create: `lib/personalization/reason-labels.ts`
- Test: `__tests__/lib/personalization-reason-labels.test.ts`
- Modify: `components/home-recommend-auto.tsx`

- [ ] **Step 1: Write failing tests for shared reason labels**

Add `__tests__/lib/personalization-reason-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getMatchReasonLabels,
  getRecommendationConfidenceLabel,
} from "@/lib/personalization/reason-labels";
import type { MatchSignal } from "@/lib/personalization/types";

describe("getMatchReasonLabels", () => {
  it("maps scoring signals to reusable Korean reason labels", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "sub_district", score: 10 },
      { kind: "income_target", score: 4 },
      { kind: "household_target", score: 3 },
      { kind: "benefit_tags", score: 3 },
      { kind: "urgent_deadline", score: 1 },
      { kind: "popularity", score: 2 },
    ];

    expect(getMatchReasonLabels(signals, { limit: 8 })).toEqual([
      "지역",
      "시군구",
      "읍면동",
      "소득",
      "가구",
      "관심",
      "마감",
      "인기",
    ]);
  });

  it("supports surface-specific label overrides while deduplicating", () => {
    const signals: MatchSignal[] = [
      { kind: "region", score: 5 },
      { kind: "district", score: 5 },
      { kind: "benefit_tags", score: 3 },
      { kind: "benefit_tags", score: 2 },
    ];

    expect(
      getMatchReasonLabels(signals, {
        limit: 5,
        labels: {
          district: "지역",
          benefit_tags: "관심분야",
        },
      }),
    ).toEqual(["지역", "관심분야"]);
  });

  it("keeps recommendation confidence language reusable", () => {
    expect(
      getRecommendationConfidenceLabel([
        { kind: "region", score: 5 },
        { kind: "income_target", score: 4 },
      ]),
    ).toBe("적합");

    expect(
      getRecommendationConfidenceLabel([{ kind: "region", score: 5 }]),
    ).toBe("확인 필요");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run __tests__/lib/personalization-reason-labels.test.ts
```

Expected: FAIL because `@/lib/personalization/reason-labels` does not exist.

- [ ] **Step 3: Implement minimal shared helper**

Create `lib/personalization/reason-labels.ts`:

```ts
import type { MatchSignal } from "@/lib/personalization/types";

export type MatchReasonLabelMap = Record<MatchSignal["kind"], string>;

export const DEFAULT_MATCH_REASON_LABELS: MatchReasonLabelMap = {
  region: "지역",
  district: "시군구",
  sub_district: "읍면동",
  benefit_tags: "관심",
  occupation: "직업",
  age: "나이",
  income_keyword: "소득",
  income_target: "소득",
  household_keyword: "가구",
  household_target: "가구",
  urgent_deadline: "마감",
  business_match: "사업자",
  popularity: "인기",
};

export type MatchReasonLabelOptions = {
  limit?: number;
  labels?: Partial<MatchReasonLabelMap>;
};

export function getMatchReasonLabels(
  signals: MatchSignal[],
  options: MatchReasonLabelOptions = {},
): string[] {
  const limit = options.limit ?? 5;
  if (limit <= 0) return [];

  const labelsByKind = {
    ...DEFAULT_MATCH_REASON_LABELS,
    ...options.labels,
  };
  const labels: string[] = [];

  for (const signal of signals) {
    const label = labelsByKind[signal.kind];
    if (!label || labels.includes(label)) continue;
    labels.push(label);
    if (labels.length >= limit) break;
  }

  return labels;
}

export function getRecommendationConfidenceLabel(signals: MatchSignal[]): string {
  const reasons = getMatchReasonLabels(signals, { limit: 10 });
  const hasQualificationSignal = signals.some((signal) =>
    signal.kind === "income_target" ||
    signal.kind === "household_target" ||
    signal.kind === "occupation" ||
    signal.kind === "business_match"
  );

  if (!hasQualificationSignal) return "확인 필요";
  if (reasons.length >= 4) return "매우 적합";
  if (reasons.length >= 2) return "적합";
  return "확인 필요";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run __tests__/lib/personalization-reason-labels.test.ts
```

Expected: PASS.

## Task 2: Shared Profile Completion Helper

**Files:**
- Create: `lib/personalization/profile-completion.ts`
- Test: `__tests__/lib/profile-completion.test.ts`
- Modify: `components/home-recommend-auto.tsx`

- [ ] **Step 1: Write failing tests for profile completion**

Add `__tests__/lib/profile-completion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getProfileCompletionSummary } from "@/lib/personalization/profile-completion";
import type { UserSignals } from "@/lib/personalization/types";

const baseSignals: UserSignals = {
  ageGroup: null,
  region: null,
  district: null,
  occupation: null,
  incomeLevel: null,
  householdTypes: [],
  benefitTags: [],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

describe("getProfileCompletionSummary", () => {
  it("summarizes completed and missing profile fields", () => {
    const summary = getProfileCompletionSummary({
      ...baseSignals,
      ageGroup: "30대",
      region: "전남",
      occupation: "자영업자",
    });

    expect(summary).toEqual({
      completed: 3,
      total: 6,
      percent: 50,
      missingLabels: ["소득", "가구", "관심분야"],
    });
  });

  it("counts child status as household context", () => {
    const summary = getProfileCompletionSummary({
      ...baseSignals,
      hasChildren: false,
    });

    expect(summary.completed).toBe(1);
    expect(summary.missingLabels).not.toContain("가구");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run __tests__/lib/profile-completion.test.ts
```

Expected: FAIL because `@/lib/personalization/profile-completion` does not exist.

- [ ] **Step 3: Implement minimal profile completion helper**

Create `lib/personalization/profile-completion.ts`:

```ts
import type { UserSignals } from "@/lib/personalization/types";

type ProfileCompletionField = {
  key: string;
  label: string;
  completed: boolean;
};

export type ProfileCompletionSummary = {
  completed: number;
  total: number;
  percent: number;
  missingLabels: string[];
};

export function getProfileCompletionSummary(
  signals: UserSignals,
): ProfileCompletionSummary {
  const fields: ProfileCompletionField[] = [
    { key: "age", label: "나이", completed: Boolean(signals.ageGroup) },
    { key: "region", label: "지역", completed: Boolean(signals.region) },
    { key: "occupation", label: "직업", completed: Boolean(signals.occupation) },
    { key: "income", label: "소득", completed: Boolean(signals.incomeLevel) },
    {
      key: "household",
      label: "가구",
      completed: signals.householdTypes.length > 0 || signals.hasChildren !== null,
    },
    { key: "interests", label: "관심분야", completed: signals.benefitTags.length > 0 },
  ];
  const completed = fields.filter((field) => field.completed).length;

  return {
    completed,
    total: fields.length,
    percent: Math.round((completed / fields.length) * 100),
    missingLabels: fields
      .filter((field) => !field.completed)
      .map((field) => field.label),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run __tests__/lib/profile-completion.test.ts
```

Expected: PASS.

## Task 3: Presentational Reason Chips Component And Homepage Wiring

**Files:**
- Create: `components/personalization/recommendation-reason-chips.tsx`
- Modify: `components/home-recommend-auto.tsx`
- Test: `__tests__/components/home-recommend-auto.test.tsx`

- [ ] **Step 1: Update homepage tests to prove wrapper behavior remains stable**

Keep `__tests__/components/home-recommend-auto.test.tsx` expectations for:

- `getHomeMatchReasonLabels` maps `sub_district` to `읍면동`.
- `district` remains collapsed into the homepage `지역` label.
- `getProfileCompletionSummary` remains exported from `components/home-recommend-auto.tsx`.
- confidence grouping remains unchanged.

- [ ] **Step 2: Run current homepage test before refactor**

Run:

```bash
npx vitest run __tests__/components/home-recommend-auto.test.tsx
```

Expected: PASS before changing the homepage wiring.

- [ ] **Step 3: Add the presentational chip component**

Create `components/personalization/recommendation-reason-chips.tsx`:

```tsx
import type { MatchSignal } from "@/lib/personalization/types";
import {
  getMatchReasonLabels,
  type MatchReasonLabelOptions,
} from "@/lib/personalization/reason-labels";

export type RecommendationReasonChipsProps = {
  signals: MatchSignal[];
  limit?: number;
  labelOptions?: Omit<MatchReasonLabelOptions, "limit">;
  className?: string;
  chipClassName?: string;
};

export function RecommendationReasonChips({
  signals,
  limit = 5,
  labelOptions,
  className = "flex flex-wrap items-center gap-1.5",
  chipClassName = "inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700",
}: RecommendationReasonChipsProps) {
  const reasons = getMatchReasonLabels(signals, {
    ...labelOptions,
    limit,
  });

  if (reasons.length === 0) return null;

  return (
    <div className={className}>
      {reasons.map((reason) => (
        <span key={reason} className={chipClassName}>
          {reason}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire homepage to shared helpers**

Modify `components/home-recommend-auto.tsx`:

- Import `RecommendationReasonChips`.
- Import `getMatchReasonLabels` and `getRecommendationConfidenceLabel` from `lib/personalization/reason-labels`.
- Import `getProfileCompletionSummary` and `ProfileCompletionSummary` from `lib/personalization/profile-completion`.
- Keep `getHomeMatchReasonLabels` as a wrapper:

```ts
export function getHomeMatchReasonLabels(signals: MatchSignal[], limit = 5): string[] {
  return getMatchReasonLabels(signals, {
    limit,
    labels: {
      district: "지역",
      benefit_tags: "관심분야",
      age: "연령",
      urgent_deadline: "마감임박",
      popularity: "🔥 인기",
    },
  });
}
```

- Replace the inline `reasons.map(...)` section with `RecommendationReasonChips` using the same homepage label overrides.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npx vitest run __tests__/lib/personalization-reason-labels.test.ts __tests__/lib/profile-completion.test.ts __tests__/components/home-recommend-auto.test.tsx
```

Expected: PASS.

## Task 4: Final Validation And Commit

**Files:**
- All files touched in Tasks 1-3.

- [ ] **Step 1: Run type/lint gates**

Run:

```bash
npx tsc --noEmit --pretty false
npm run lint
```

Expected: both PASS.

- [ ] **Step 2: Run broader CI if feasible**

Run:

```bash
npm run ci
```

Expected: PASS. If current HEAD has unrelated drift, isolate whether it is caused by this slice before editing unrelated files.

- [ ] **Step 3: Commit and push the narrow slice**

Run:

```bash
git add lib/personalization/reason-labels.ts lib/personalization/profile-completion.ts components/personalization/recommendation-reason-chips.tsx components/home-recommend-auto.tsx __tests__/lib/personalization-reason-labels.test.ts __tests__/lib/profile-completion.test.ts __tests__/components/home-recommend-auto.test.tsx docs/superpowers/plans/2026-05-21-policy-personalization-loop-slice1.md
git commit -m "refactor(personalization): share recommendation reasons"
git push
```

Expected: commit and push only this slice.

## Self-Review

- Spec coverage: This plan covers Slice 1 only: shared reason labels, shared profile completion summary, and homepage behavior preservation.
- Scope intentionally deferred: notification history inbox, item-state persistence, and admin cockpit stay out of this slice.
- Next.js constraint: the new presentational component has no browser-only APIs and no data fetching, so it can be used by Server Components and Client Components.
- Safety: no production DB writes, no deployment, no risky automation.
