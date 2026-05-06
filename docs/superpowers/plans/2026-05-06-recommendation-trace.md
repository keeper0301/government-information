# 추천 시스템 진단 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/recommendation-trace` 어드민 페이지로 사장님 본인 + 가상 페르소나 6개 × welfare/loan/news/blog 4 영역의 노출/차단 패턴을 측정하는 진단 도구를 구축. 추측 기반 fix 누적을 데이터 기반 결정으로 전환.

**Architecture:** `lib/personalization/diagnostic.ts` 의 `traceScore` pure function 이 score.ts 의 `scoreProgram` 결과 + signals 분석으로 BlockReason 분류 → server component 가 4 영역 pool fetch + trace → 어드민 페이지에 차단 사유별 분류·점수 분포·정책 목록 렌더. score.ts 로직 변경 0 (export 만 1줄 추가).

**Tech Stack:** Next.js 16 server components / TypeScript / vitest / Tailwind / Supabase

연관 spec: `docs/superpowers/specs/2026-05-06-recommendation-trace-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 | 라인 추정 |
|---|---|---|---|
| `lib/personalization/score.ts` | 수정 (1줄) | `isCohortMismatch` + `buildProgramText` export | +0/-0 (export 키워드만) |
| `lib/personalization/diagnostic.ts` | 신규 | `traceScore` / `summarizeTrace` / `BlockReason` | ~200 |
| `__tests__/personalization/diagnostic.test.ts` | 신규 | 차단 사유 분류 단위 테스트 8건 | ~120 |
| `app/admin/recommendation-trace/personas.ts` | 신규 | 가상 페르소나 6개 상수 | ~85 |
| `app/admin/recommendation-trace/trace-area.ts` | 신규 | 4 영역 pool fetch + traceScore 실행 | ~140 |
| `app/admin/recommendation-trace/persona-form.tsx` | 신규 | 클라이언트 폼 (페르소나 선택) | ~80 |
| `app/admin/recommendation-trace/page.tsx` | 신규 | server component, 4 카드 렌더 | ~280 |
| `lib/admin/menu.ts` | 수정 (3줄) | 사이드 메뉴 "추천 진단" 항목 추가 | +1줄 |

---

## Task 1: `score.ts` 내부 함수 export 추가

**Files:**
- Modify: `lib/personalization/score.ts`

진단에서 본문 매칭 위치 추출 + cohort 차단 사유 판별을 위해 internal helper 2개 export. 로직 변경 0 — `export` 키워드만 추가.

- [ ] **Step 1: `buildProgramText` export 키워드 추가**

`lib/personalization/score.ts:27` 의 다음 줄:

```ts
function buildProgramText(program: ScorableItem): string {
```

를 다음으로 교체:

```ts
export function buildProgramText(program: ScorableItem): string {
```

- [ ] **Step 2: `isCohortMismatch` export 키워드 추가**

`lib/personalization/score.ts` 에서 `isCohortMismatch` 정의 줄 (검색: `function isCohortMismatch`) 을 찾아 `export function isCohortMismatch` 로 변경.

- [ ] **Step 3: 회귀 확인**

Run: `npx tsc --noEmit && npm test -- personalization`

Expected: 모두 PASS. `score.ts` 의 logical change 0이라 기존 테스트 전부 그대로 통과.

---

## Task 2: `diagnostic.ts` 단위 테스트 작성 (TDD red)

**Files:**
- Create: `__tests__/personalization/diagnostic.test.ts`

- [ ] **Step 1: 테스트 파일 신규 생성**

다음 내용으로 `__tests__/personalization/diagnostic.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import {
  traceScore,
  summarizeTrace,
  type BlockReason,
} from "@/lib/personalization/diagnostic";
import type { ScorableItem } from "@/lib/personalization/score";
import type { UserSignals } from "@/lib/personalization/types";

const baseProgram: ScorableItem = {
  id: "p1",
  title: "테스트 정책",
  description: "지원 사업입니다",
  region: null,
  district: null,
  benefit_tags: ["취업"],
  apply_end: null,
  source: "광역도청",
  household_target_tags: null,
  income_target_level: null,
};

const baseUser: UserSignals = {
  ageGroup: "40대",
  region: "전남",
  district: null,
  occupation: "자영업자",
  incomeLevel: null,
  householdTypes: [],
  benefitTags: [],
  hasChildren: null,
  merit: null,
  businessProfile: null,
};

describe("traceScore — 차단 사유 분류", () => {
  it("정책 region=서울 + 사용자 region=전남 → regional_gate", () => {
    const r = traceScore(
      { ...baseProgram, region: "서울특별시" },
      baseUser,
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("regional_gate");
    expect(r.score).toBe(0);
  });

  it("정책 household_target=[single_parent] + 사용자=[married] → household_gate", () => {
    const r = traceScore(
      { ...baseProgram, household_target_tags: ["single_parent"] },
      { ...baseUser, householdTypes: ["married"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("household_gate");
  });

  it("정책 본문 '여성새로일하기' + 일반 사용자 → cohort_mismatch", () => {
    const r = traceScore(
      {
        ...baseProgram,
        description:
          "경력단절여성 등을 대상으로 여성새로일하기지원센터 사업 운영",
      },
      baseUser,
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("cohort_mismatch");
    expect(r.excerptForCohort).not.toBeNull();
  });

  it("정책 본문 신호 0 + 사용자 입력 0 → no_signal 또는 below_min_score", () => {
    const r = traceScore(
      { ...baseProgram, description: "공지", benefit_tags: [] },
      {
        ...baseUser,
        ageGroup: null,
        region: null,
        occupation: null,
        benefitTags: [],
      },
      8,
    );
    // signals 없으면 no_signal, 약한 시그널만 있으면 below_min_score
    expect(["no_signal", "below_min_score"]).toContain(r.blockReason);
  });

  it("정책 region+benefit 매칭 + score ≥ 8 → shown", () => {
    const r = traceScore(
      {
        ...baseProgram,
        region: "전라남도",
        benefit_tags: ["취업"],
        title: "전남 자영업자 지원사업",
      },
      { ...baseUser, benefitTags: ["취업"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("shown");
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it("score 1 ≤ score < minScore → below_min_score", () => {
    // 약한 시그널 1개만 — score 가 minScore 미만이지만 0 아님
    const r = traceScore(
      {
        ...baseProgram,
        region: null,
        benefit_tags: ["취업"],
      },
      { ...baseUser, benefitTags: ["취업"] },
      8,
    );
    expect(r.blockReason).toBe<BlockReason>("below_min_score");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(8);
  });
});

describe("summarizeTrace", () => {
  it("100건 입력 → blocked 카운트 합 + shown = total", () => {
    const traces = Array.from({ length: 100 }, (_, i): ReturnType<typeof traceScore> => ({
      programId: `p${i}`,
      programTitle: `정책 ${i}`,
      score: i % 5,
      signals: [],
      blockReason: i < 30 ? "shown" : "cohort_mismatch",
      programRegion: null,
      programHouseholdTags: null,
      programBenefitTags: [],
      excerptForCohort: null,
    }));
    const s = summarizeTrace(traces);
    expect(s.total).toBe(100);
    expect(s.shown).toBe(30);
    expect(s.blocked.cohort_mismatch).toBe(70);
    const blockedSum = Object.values(s.blocked).reduce((a, b) => a + b, 0);
    expect(s.shown + blockedSum).toBe(s.total);
  });

  it("점수 분포 4 bucket 합 = total", () => {
    const traces = [0, 0, 1, 3, 4, 7, 8, 10].map((score, i): ReturnType<typeof traceScore> => ({
      programId: `p${i}`,
      programTitle: "p",
      score,
      signals: [],
      blockReason: score >= 8 ? "shown" : "below_min_score",
      programRegion: null,
      programHouseholdTags: null,
      programBenefitTags: [],
      excerptForCohort: null,
    }));
    const s = summarizeTrace(traces);
    const bucketSum = s.scoreDistribution.reduce((a, b) => a + b.count, 0);
    expect(bucketSum).toBe(8);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인 (TDD red)**

Run: `npm test -- diagnostic`

Expected: 8 tests FAIL with "Cannot find module '@/lib/personalization/diagnostic'" 또는 import error.

---

## Task 3: `diagnostic.ts` 구현 (TDD green)

**Files:**
- Create: `lib/personalization/diagnostic.ts`

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `lib/personalization/diagnostic.ts` 생성:

```ts
// lib/personalization/diagnostic.ts
// ============================================================
// 추천 시스템 진단 — 단일 정책에 대한 score + 차단 사유 분류
// ============================================================
// /admin/recommendation-trace 어드민 페이지 전용. score.ts 의 scoreProgram
// 결과를 그대로 사용 + signals 분석으로 BlockReason 분류.
// score.ts 로직 변경 X (read-only 진단).
// ============================================================

import {
  scoreProgram,
  isCohortMismatch,
  buildProgramText,
  type ScorableItem,
} from "./score";
import type { UserSignals, MatchSignal } from "./types";

export type BlockReason =
  | "shown"             // score >= minScore, 노출됨
  | "below_min_score"   // score 1 이상이지만 minScore 미만
  | "no_signal"         // score 0 + 차단 사유 없음 (단순 매칭 신호 없음)
  | "cohort_mismatch"   // 본문 substring cohort 차단
  | "regional_gate"     // 광역 mismatch 로 강제 차단
  | "household_gate"    // household_target_tags 와 user.householdTypes 교집합 0
  | "business_mismatch" // business 자격 미달 강제 차단
  | "income_gate";      // income_target_level 미달

export type ScoreTrace = {
  programId: string;
  programTitle: string;
  score: number;
  signals: MatchSignal[];
  blockReason: BlockReason;
  programRegion: string | null;
  programHouseholdTags: string[] | null;
  programBenefitTags: string[];
  // cohort_mismatch 일 때만 ~120자 발췌 (false positive 의심 시 사장님 추적용)
  excerptForCohort: string | null;
};

export type TraceSummary = {
  total: number;
  shown: number;
  blocked: Record<BlockReason, number>;
  scoreDistribution: { bucket: string; count: number }[];
};

const SCORE_BUCKETS: { label: string; test: (score: number) => boolean }[] = [
  { label: "0", test: (s) => s === 0 },
  { label: "1-3", test: (s) => s >= 1 && s <= 3 },
  { label: "4-7", test: (s) => s >= 4 && s <= 7 },
  { label: "8+", test: (s) => s >= 8 },
];

/**
 * 단일 정책 trace — scoreProgram 결과 + 차단 사유 분류.
 *
 * 차단 분기 우선순위 (score.ts 의 scoreProgram 내부 순서와 동일):
 *   1. cohort_mismatch (본문 substring)
 *   2. income_gate (income_target_level)
 *   3. regional_gate (program.region 있음 + user.region 있음 + 광역 mismatch)
 *   4. household_gate (household_target_tags 명시 + user householdTypes 명시 + 교집합 0)
 *   5. business_mismatch (signals 분석으로 추정)
 *   6. below_min_score / no_signal / shown
 */
export function traceScore<T extends ScorableItem>(
  program: T,
  user: UserSignals,
  minScore: number,
): ScoreTrace {
  const haystack = buildProgramText(program);

  // ⓪ Cohort mismatch 사전 판별
  if (isCohortMismatch(haystack, user)) {
    return {
      programId: program.id,
      programTitle: program.title,
      score: 0,
      signals: [],
      blockReason: "cohort_mismatch",
      programRegion: program.region ?? null,
      programHouseholdTags: program.household_target_tags ?? null,
      programBenefitTags: program.benefit_tags ?? [],
      excerptForCohort: extractCohortExcerpt(haystack, user),
    };
  }

  // 실제 score 평가 — score.ts 의 scoreProgram 호출 (변경 X)
  const result = scoreProgram(program, user);

  // score=0 + signals=[] 면 어떤 gate 에서 강제 차단된 것
  // score.ts 의 차단 분기 순서와 동일하게 우선순위 평가
  if (result.score === 0 && result.signals.length === 0) {
    // income_gate
    if (program.income_target_level && user.incomeLevel) {
      // hasIncomeTargetMismatch 동등 평가 (단순화)
      const programLevel = program.income_target_level;
      if (programLevel !== "any" && programLevel !== user.incomeLevel) {
        return makeBlocked(program, "income_gate");
      }
    }
    // regional_gate
    if (program.region && user.region) {
      // 광역 mismatch 판별: 정책 region 에 user 광역 별칭 어느 것도 prefix/contain 안 됨
      // 단순화: 정확히 사용자 region 또는 별칭 prefix 매칭 안 되면 mismatch
      // (사장님 region "전남" 일 때 정책 region "서울특별시" → mismatch)
      if (!regionMatch(program.region, user.region)) {
        return makeBlocked(program, "regional_gate");
      }
    }
    // household_gate
    if (
      program.household_target_tags &&
      program.household_target_tags.length > 0 &&
      user.householdTypes.length > 0
    ) {
      const overlap = user.householdTypes.filter((ht) =>
        program.household_target_tags!.includes(ht),
      );
      if (overlap.length === 0) {
        return makeBlocked(program, "household_gate");
      }
    }
    // business_mismatch
    if (user.businessProfile) {
      // signals 비어있고 위 게이트 다 통과했는데도 score=0 이면 business_mismatch 추정
      return makeBlocked(program, "business_mismatch");
    }
    // 위 어느 게이트도 트리거 안 했지만 score=0 + signals=[] →
    // 정책에 매칭 신호 없음 (region NULL, benefit_tags 빈 배열, 본문 키워드 0)
    return makeBlocked(program, "no_signal");
  }

  // score 가 1+ 이면 minScore 비교
  const blockReason: BlockReason =
    result.score >= minScore ? "shown" : "below_min_score";

  return {
    programId: program.id,
    programTitle: program.title,
    score: result.score,
    signals: result.signals,
    blockReason,
    programRegion: program.region ?? null,
    programHouseholdTags: program.household_target_tags ?? null,
    programBenefitTags: program.benefit_tags ?? [],
    excerptForCohort: null,
  };
}

function makeBlocked<T extends ScorableItem>(
  program: T,
  reason: BlockReason,
): ScoreTrace {
  return {
    programId: program.id,
    programTitle: program.title,
    score: 0,
    signals: [],
    blockReason: reason,
    programRegion: program.region ?? null,
    programHouseholdTags: program.household_target_tags ?? null,
    programBenefitTags: program.benefit_tags ?? [],
    excerptForCohort: null,
  };
}

// 사용자 region 별칭 ("전남" / "전라남도" / "전북특별자치도" 등) 과 program.region prefix 매칭
// score.ts 의 evaluateRegion 보다 단순화 — 진단용으로 광역 일치 여부만
function regionMatch(programRegion: string, userRegion: string): boolean {
  if (programRegion === "전국") return true;
  // 사용자 region 의 짧은 형식이 정책 region 에 포함되거나 정책 region 의 광역명이 사용자 region 과 일치
  if (programRegion.includes(userRegion)) return true;
  // 별칭 매핑은 score.ts 의 REGION_ALIASES 따로 import 가능. 여기선 단순화.
  return false;
}

// cohort 차단 사유의 본문 발췌 (~120자) — false positive 추적용
function extractCohortExcerpt(haystack: string, user: UserSignals): string {
  // 사용자 cohort 와 무관한 키워드가 매칭됐을 가능성이 높은 부분을 발췌.
  // 단순 구현: haystack 의 첫 120자 (score.ts 의 구체 키워드를 import 하지 않고
  // 어드민이 raw 본문 보고 직접 판단)
  // (어드민 페이지에서 사장님이 차단 사유와 함께 본문 발췌를 보고 추적)
  const trimmed = haystack.trim();
  if (trimmed.length <= 120) return trimmed;
  // 단순 fallback: 사용자 cohort 와 충돌 가능성 높은 keyword 위치 탐색
  // 실패 시 첫 120자 발췌
  const keywords = [
    "여성", "청년", "노인", "학생", "장애", "한부모",
    "다자녀", "기초", "수급", "보훈", "농어",
  ];
  for (const k of keywords) {
    const idx = trimmed.indexOf(k);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(trimmed.length, idx + 80);
      return (start > 0 ? "..." : "") + trimmed.slice(start, end) + (end < trimmed.length ? "..." : "");
    }
  }
  return trimmed.slice(0, 120) + "...";
}

/**
 * trace 배열을 받아 차단 사유별 합계 + 점수 분포 4 bucket 반환.
 */
export function summarizeTrace(traces: ScoreTrace[]): TraceSummary {
  const blocked: Record<BlockReason, number> = {
    shown: 0,
    below_min_score: 0,
    no_signal: 0,
    cohort_mismatch: 0,
    regional_gate: 0,
    household_gate: 0,
    business_mismatch: 0,
    income_gate: 0,
  };

  for (const t of traces) {
    blocked[t.blockReason] = (blocked[t.blockReason] ?? 0) + 1;
  }

  const shown = blocked.shown;
  // shown 은 blocked 카운트에서 분리 표시 — total - shown 만 실제 차단
  const blockedOnly: Record<BlockReason, number> = { ...blocked, shown: 0 };

  const scoreDistribution = SCORE_BUCKETS.map((b) => ({
    bucket: b.label,
    count: traces.filter((t) => b.test(t.score)).length,
  }));

  return {
    total: traces.length,
    shown,
    blocked: blockedOnly,
    scoreDistribution,
  };
}
```

- [ ] **Step 2: 테스트 통과 확인 (TDD green)**

Run: `npm test -- diagnostic`

Expected: 8 tests PASS.

- [ ] **Step 3: 전체 회귀 (기존 personalization 보존)**

Run: `npm test -- personalization`

Expected: 모든 personalization 테스트 PASS.

---

## Task 4: 가상 페르소나 6 개 정의 (`personas.ts`)

**Files:**
- Create: `app/admin/recommendation-trace/personas.ts`

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `app/admin/recommendation-trace/personas.ts` 생성:

```ts
// app/admin/recommendation-trace/personas.ts
// ============================================================
// 추천 진단용 가상 페르소나 6 개 정의
// ============================================================
// 각 페르소나가 서로 다른 cohort gate 를 트리거 — false positive / negative
// 패턴 노출용. 6 + 사장님 본인 = 7 케이스 × 4 영역 = 28 baseline.
// ============================================================

import type { UserSignals } from "@/lib/personalization/types";

export type PersonaId =
  | "self"        // 사장님 본인 (DB fetch)
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6";

export type Persona = {
  id: Exclude<PersonaId, "self">;
  label: string;
  description: string;
  signals: UserSignals;
};

export const PERSONAS: Persona[] = [
  {
    id: "p2",
    label: "30대 서울 직장인 신혼",
    description: "양육 관심, married, 자녀 없음 — 신혼·청년·직장인 cohort 트리거",
    signals: {
      ageGroup: "30대",
      region: "서울",
      district: null,
      occupation: "직장인",
      incomeLevel: null,
      householdTypes: ["married"],
      benefitTags: ["양육"],
      hasChildren: null,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p3",
    label: "60대 부산 농어민 자녀동반",
    description: "노년·농어민·아동 cohort 트리거",
    signals: {
      ageGroup: "60대 이상",
      region: "부산",
      district: null,
      occupation: "농어민",
      incomeLevel: null,
      householdTypes: [],
      benefitTags: [],
      hasChildren: true,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p4",
    label: "20대 서울 대학생 single",
    description: "청년·대학생·single cohort 트리거",
    signals: {
      ageGroup: "20대",
      region: "서울",
      district: null,
      occupation: "대학생",
      incomeLevel: null,
      householdTypes: ["single"],
      benefitTags: ["교육"],
      hasChildren: false,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p5",
    label: "40대 경기 한부모 다자녀",
    description: "한부모·다자녀·아동 cohort 트리거",
    signals: {
      ageGroup: "40대",
      region: "경기",
      district: null,
      occupation: "직장인",
      incomeLevel: "low",
      householdTypes: ["single_parent", "multi_child"],
      benefitTags: ["양육", "주거"],
      hasChildren: true,
      merit: null,
      businessProfile: null,
    },
  },
  {
    id: "p6",
    label: "50대 충남 장애가구 보훈",
    description: "장애·보훈 cohort 트리거",
    signals: {
      ageGroup: "50대",
      region: "충남",
      district: null,
      occupation: "직장인",
      incomeLevel: null,
      householdTypes: ["disabled_family"],
      benefitTags: ["의료"],
      hasChildren: null,
      merit: "merit",
      businessProfile: null,
    },
  },
];

export function findPersona(id: string): Persona | null {
  return PERSONAS.find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error. `UserSignals` 타입과 호환되는지 확인.

---

## Task 5: 4 영역 trace helper (`trace-area.ts`)

**Files:**
- Create: `app/admin/recommendation-trace/trace-area.ts`

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `app/admin/recommendation-trace/trace-area.ts` 생성:

```ts
// app/admin/recommendation-trace/trace-area.ts
// ============================================================
// 4 영역 (welfare/loan/news/blog) pool fetch + 각 정책 traceScore 실행
// ============================================================
// 기존 페이지 (/welfare, /loan, /news, /blog) 의 pool query 와 동일 SQL —
// 일관성 유지. score.ts 내부 호출도 동일 → 각 페이지 점수와 일치.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import {
  traceScore,
  summarizeTrace,
  type ScoreTrace,
  type TraceSummary,
} from "@/lib/personalization/diagnostic";
import type { UserSignals } from "@/lib/personalization/types";
import type { ScorableItem } from "@/lib/personalization/score";
import { newsRowToScorable, blogRowToScorable } from "@/lib/personalization/home-recent";

export type AreaName = "welfare" | "loan" | "news" | "blog";

export type AreaResult = {
  area: AreaName;
  traces: ScoreTrace[];
  summary: TraceSummary;
  error?: string;
};

const POOL_LIMIT = 100;
const MIN_SCORES: Record<AreaName, number> = {
  welfare: 8,
  loan: 8,
  news: 8,
  blog: 3,
};

export async function traceWelfare(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("welfare_programs")
      .select(
        "id, title, target, description, eligibility, region, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .order("created_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const pool = (data ?? []) as ScorableItem[];
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.welfare));
    return { area: "welfare", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "welfare",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceLoan(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("loan_programs")
      .select(
        "id, title, target, description, eligibility, region_tags, benefit_tags, apply_end, source, income_target_level, household_target_tags",
      )
      .order("created_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      target: string | null;
      description: string | null;
      eligibility: string | null;
      region_tags: string[] | null;
      benefit_tags: string[] | null;
      apply_end: string | null;
      source: string | null;
      income_target_level: ScorableItem["income_target_level"];
      household_target_tags: string[] | null;
    }>;
    // loan 은 region 컬럼 없음 → region_tags 첫 항목을 region 으로 (단순화)
    const pool: ScorableItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      target: r.target,
      description: r.description,
      eligibility: r.eligibility,
      region: r.region_tags?.[0] ?? null,
      district: null,
      benefit_tags: r.benefit_tags,
      apply_end: r.apply_end,
      source: r.source,
      income_target_level: r.income_target_level,
      household_target_tags: r.household_target_tags,
    }));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.loan));
    return { area: "loan", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "loan",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceNews(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("news_posts_deduped" as "news_posts")
      .select(
        "id, slug, title, summary, body, ministry, benefit_tags, published_at",
      )
      .order("published_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      summary: string | null;
      body: string | null;
      ministry: string | null;
      benefit_tags: string[] | null;
    }>;
    const pool: ScorableItem[] = rows.map((r) => newsRowToScorable(r));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.news));
    return { area: "news", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "news",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

export async function traceBlog(user: UserSignals): Promise<AreaResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug, title, meta_description, category, tags, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(POOL_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      slug: string;
      title: string;
      meta_description: string | null;
      category: string | null;
      tags: string[] | null;
    }>;
    const pool: ScorableItem[] = rows.map((r) => blogRowToScorable(r));
    const traces = pool.map((p) => traceScore(p, user, MIN_SCORES.blog));
    return { area: "blog", traces, summary: summarizeTrace(traces) };
  } catch (e) {
    return {
      area: "blog",
      traces: [],
      summary: emptySummary(),
      error: (e as Error).message,
    };
  }
}

function emptySummary(): TraceSummary {
  return {
    total: 0,
    shown: 0,
    blocked: {
      shown: 0,
      below_min_score: 0,
      no_signal: 0,
      cohort_mismatch: 0,
      regional_gate: 0,
      household_gate: 0,
      business_mismatch: 0,
      income_gate: 0,
    },
    scoreDistribution: [
      { bucket: "0", count: 0 },
      { bucket: "1-3", count: 0 },
      { bucket: "4-7", count: 0 },
      { bucket: "8+", count: 0 },
    ],
  };
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error.

---

## Task 6: 클라이언트 폼 (`persona-form.tsx`)

**Files:**
- Create: `app/admin/recommendation-trace/persona-form.tsx`

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `app/admin/recommendation-trace/persona-form.tsx` 생성:

```tsx
"use client";

// app/admin/recommendation-trace/persona-form.tsx
// 페르소나 선택 → URL ?persona=<id> 업데이트 → server component 재렌더

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PERSONAS, type PersonaId } from "./personas";

type Props = {
  current: PersonaId;
};

export function PersonaForm({ current }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (id: PersonaId) => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (id !== "self") params.set("persona", id);
      router.push(`/admin/recommendation-trace?${params.toString()}`);
    });
  };

  return (
    <div className="rounded-lg border border-grey-200 bg-white p-4">
      <p className="text-xs font-semibold text-grey-700 mb-2 tracking-[0.04em] uppercase">
        프로필 선택
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleChange("self")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
            current === "self"
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
          }`}
        >
          🧑 사장님 본인
        </button>
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={isPending}
            onClick={() => handleChange(p.id)}
            title={p.description}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              current === p.id
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {isPending && (
        <p className="text-xs text-grey-500 mt-2">로딩 중...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error.

---

## Task 7: 어드민 페이지 (`page.tsx`)

**Files:**
- Create: `app/admin/recommendation-trace/page.tsx`

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `app/admin/recommendation-trace/page.tsx` 생성:

```tsx
// app/admin/recommendation-trace/page.tsx
// ============================================================
// 추천 시스템 진단 — 사장님 본인 + 가상 페르소나 6개 × 4 영역 trace
// ============================================================
// score.ts read-only. 각 정책의 차단 사유 분류 + 점수 분포 + 본문 발췌
// 로 false positive / negative 패턴 사장님이 직접 검토.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  traceWelfare,
  traceLoan,
  traceNews,
  traceBlog,
  type AreaResult,
  type AreaName,
} from "./trace-area";
import { PersonaForm } from "./persona-form";
import { PERSONAS, findPersona, type PersonaId } from "./personas";
import type { UserSignals } from "@/lib/personalization/types";
import type { BlockReason } from "@/lib/personalization/diagnostic";

export const metadata: Metadata = {
  title: "추천 진단 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const AREA_LABEL: Record<AreaName, string> = {
  welfare: "추천 정책",
  loan: "추천 대출",
  news: "정책 소식",
  blog: "블로그 가이드",
};

const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
  shown: "노출",
  below_min_score: "점수 부족",
  no_signal: "매칭 신호 없음",
  cohort_mismatch: "cohort 차단 ⚠ false positive 의심",
  regional_gate: "지역 mismatch",
  household_gate: "가구 mismatch",
  business_mismatch: "사업자 자격 미달",
  income_gate: "소득 미달",
};

export default async function RecommendationTracePage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/recommendation-trace");
  if (!isAdminUser(user.email)) redirect("/");

  const personaId: PersonaId = (params.persona as PersonaId) || "self";

  // signals 결정
  let signals: UserSignals | null = null;
  let label = "";
  let description = "";
  let isEmpty = false;

  if (personaId === "self") {
    const profile = await loadUserProfile();
    if (profile && !profile.isEmpty) {
      signals = profile.signals;
      label = `사장님 본인 (${profile.displayName})`;
      description = formatSignalsHuman(profile.signals);
    } else {
      isEmpty = true;
      label = "사장님 본인";
      description = "프로필이 비어있어요";
    }
  } else {
    const persona = findPersona(personaId);
    if (persona) {
      signals = persona.signals;
      label = persona.label;
      description = persona.description;
    } else {
      // invalid persona id → self fallback
      const profile = await loadUserProfile();
      if (profile && !profile.isEmpty) signals = profile.signals;
      label = "사장님 본인";
      description = profile && !profile.isEmpty ? formatSignalsHuman(profile.signals) : "프로필 비어있음";
      isEmpty = !signals;
    }
  }

  // signals 없으면 안내 + 페르소나 선택만
  if (!signals) {
    return (
      <div className="max-w-[1100px]">
        <AdminPageHeader
          kicker="ADMIN · 지표·분석"
          title="추천 진단"
          description="사장님 본인 + 가상 페르소나 × 4 영역의 노출/차단 패턴 측정"
        />
        <PersonaForm current={personaId} />
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {isEmpty
            ? "사장님 프로필이 비어있어요. 페르소나 2-6 중 선택하세요."
            : "프로필을 불러올 수 없어요."}
        </div>
      </div>
    );
  }

  // 4 영역 병렬 trace
  const [welfare, loan, news, blog] = await Promise.all([
    traceWelfare(signals),
    traceLoan(signals),
    traceNews(signals),
    traceBlog(signals),
  ]);

  return (
    <div className="max-w-[1100px]">
      <AdminPageHeader
        kicker="ADMIN · 지표·분석"
        title="추천 진단"
        description="사장님 본인 + 가상 페르소나 × 4 영역의 노출/차단 패턴 측정"
      />
      <PersonaForm current={personaId} />
      <div className="mt-2 mb-5 px-4 py-2.5 rounded-md bg-grey-50 text-xs text-grey-700">
        <strong className="text-grey-900">{label}</strong> — {description}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AreaCard result={welfare} />
        <AreaCard result={loan} />
        <AreaCard result={news} />
        <AreaCard result={blog} />
      </div>
    </div>
  );
}

function AreaCard({ result }: { result: AreaResult }) {
  const { area, traces, summary, error } = result;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-bold text-red-900">{AREA_LABEL[area]}</h2>
        <p className="text-xs text-red-700 mt-1">에러: {error}</p>
      </div>
    );
  }

  const shownPct = summary.total > 0 ? Math.round((summary.shown / summary.total) * 100) : 0;
  const blockedTotal = summary.total - summary.shown;
  const blockReasonsRanked = (Object.entries(summary.blocked) as [BlockReason, number][])
    .filter(([reason, n]) => n > 0 && reason !== "shown")
    .sort((a, b) => b[1] - a[1]);
  const cohortBlocked = traces.filter((t) => t.blockReason === "cohort_mismatch");
  const otherBlocked = traces.filter(
    (t) => t.blockReason !== "shown" && t.blockReason !== "cohort_mismatch",
  );
  const shownTraces = traces.filter((t) => t.blockReason === "shown")
    .sort((a, b) => b.score - a.score);

  return (
    <article className="rounded-lg border border-grey-200 bg-white p-4">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-grey-900">{AREA_LABEL[area]}</h2>
        <span className="text-xs text-grey-500">pool {summary.total}</span>
      </header>

      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-md bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">노출</p>
          <p className="text-base font-bold text-blue-900">
            {summary.shown}건 ({shownPct}%)
          </p>
        </div>
        <div className="flex-1 rounded-md bg-grey-100 px-3 py-2">
          <p className="text-xs text-grey-600">차단</p>
          <p className="text-base font-bold text-grey-900">
            {blockedTotal}건 ({100 - shownPct}%)
          </p>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-grey-700 mb-1">차단 사유</p>
        <ul className="text-xs space-y-0.5">
          {blockReasonsRanked.map(([reason, n]) => (
            <li key={reason} className="flex justify-between">
              <span className="text-grey-700">{BLOCK_REASON_LABEL[reason]}</span>
              <span className="font-semibold text-grey-900 tabular-nums">
                {n}건
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-grey-700 mb-1">점수 분포</p>
        <div className="flex gap-1">
          {summary.scoreDistribution.map((d) => (
            <div key={d.bucket} className="flex-1">
              <div
                className="h-10 rounded-sm bg-blue-200 flex items-end justify-center"
                style={{
                  height: `${Math.max(8, Math.min(40, d.count * 0.5 + 8))}px`,
                }}
              >
                <span className="text-xs text-blue-900 font-semibold">
                  {d.count}
                </span>
              </div>
              <p className="text-xs text-center text-grey-600 mt-0.5">
                {d.bucket}
              </p>
            </div>
          ))}
        </div>
      </div>

      {cohortBlocked.length > 0 && (
        <details className="mb-2">
          <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
            cohort 차단 {cohortBlocked.length}건 (false positive 의심)
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {cohortBlocked.slice(0, 5).map((t) => (
              <li
                key={t.programId}
                className="rounded bg-amber-50 border border-amber-100 p-2"
              >
                <p className="font-semibold text-grey-900">{t.programTitle}</p>
                {t.excerptForCohort && (
                  <p className="mt-0.5 text-grey-600 leading-snug">
                    {t.excerptForCohort}
                  </p>
                )}
              </li>
            ))}
            {cohortBlocked.length > 5 && (
              <li className="text-grey-500">... 외 {cohortBlocked.length - 5}건</li>
            )}
          </ul>
        </details>
      )}

      {otherBlocked.length > 0 && (
        <details className="mb-2">
          <summary className="text-xs font-semibold text-grey-700 cursor-pointer">
            기타 차단 {otherBlocked.length}건
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {otherBlocked.slice(0, 5).map((t) => (
              <li key={t.programId} className="text-grey-600">
                <span className="text-grey-900">{t.programTitle}</span>
                <span className="ml-1 text-grey-500">
                  ({BLOCK_REASON_LABEL[t.blockReason]})
                </span>
              </li>
            ))}
            {otherBlocked.length > 5 && (
              <li className="text-grey-500">... 외 {otherBlocked.length - 5}건</li>
            )}
          </ul>
        </details>
      )}

      {shownTraces.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-blue-700 cursor-pointer">
            노출 {shownTraces.length}건 (점수순)
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {shownTraces.slice(0, 5).map((t) => (
              <li key={t.programId} className="text-grey-600">
                <span className="text-grey-900 font-medium">{t.programTitle}</span>
                <span className="ml-1 text-blue-700 font-semibold tabular-nums">
                  {t.score}점
                </span>
                <span className="ml-1 text-grey-500">
                  ({t.signals.map((s) => `${s.kind}+${s.score}`).join(", ")})
                </span>
              </li>
            ))}
            {shownTraces.length > 5 && (
              <li className="text-grey-500">... 외 {shownTraces.length - 5}건</li>
            )}
          </ul>
        </details>
      )}
    </article>
  );
}

function formatSignalsHuman(s: UserSignals): string {
  const parts: string[] = [];
  if (s.ageGroup) parts.push(s.ageGroup);
  if (s.region) parts.push(s.region);
  if (s.occupation) parts.push(s.occupation);
  if (s.householdTypes.length > 0) parts.push(`[${s.householdTypes.join(", ")}]`);
  if (s.incomeLevel) parts.push(`소득 ${s.incomeLevel}`);
  if (s.merit === "merit") parts.push("보훈");
  return parts.join(" · ") || "신호 없음";
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error.

---

## Task 8: 사이드 메뉴 항목 추가 (`menu.ts`)

**Files:**
- Modify: `lib/admin/menu.ts:62`

- [ ] **Step 1: 그룹 4 "지표·분석" 에 새 항목 추가**

`lib/admin/menu.ts:62` 에서 그룹 4 의 items 배열을 다음으로 교체:

```ts
    items: [
      { href: "/admin/insights", label: "사용자 funnel", icon: "📈" },
      { href: "/admin/targeting", label: "본문 targeting 분석", icon: "🎯" },
      { href: "/admin/business", label: "자영업자 자격 진단", icon: "🏪" },
      { href: "/admin/recommendation-trace", label: "추천 진단", icon: "🔍" },
    ],
```

(기존 3개 그대로 + 마지막에 한 줄 추가)

- [ ] **Step 2: 메뉴 통합 typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error.

---

## Task 9: 전체 회귀 확인

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm test`

Expected: 모든 테스트 PASS (494 + 신규 8 = 502 이상).

- [ ] **Step 2: lint**

Run: `npm run lint`

Expected: 0 error.

- [ ] **Step 3: typecheck 최종**

Run: `npx tsc --noEmit`

Expected: 0 error.

- [ ] **Step 4: 수동 페이지 미리보기 (옵션)**

dev 서버 실행 시 `/admin/recommendation-trace` 접속해서 페르소나 클릭 → 4 카드 렌더 확인. dev 안 띄우는 경우 skip.

---

## Task 10: code-reviewer subagent dispatch (push 전 필수)

사장님 메모리: "모든 작업 완료 후 code reviewer subagent dispatch 필수. 자체 review 만으로 push 금지".

- [ ] **Step 1: 변경 파일 정리**

Run: `git status --short; git diff --stat`

Expected: 5 신규 + 2 수정.

- [ ] **Step 2: subagent dispatch (Agent 도구, general-purpose)**

다음 prompt 로 dispatch:
- 변경 파일 목록 (신규 5 + 수정 2)
- spec / plan 경로
- 점검 포인트:
  1. score.ts export 추가가 internal 의 다른 호출자 break 없는지
  2. `traceScore` 의 차단 사유 분류 우선순위가 score.ts 의 scoreProgram 분기와 일치하는지
  3. 4 영역 pool fetch 가 기존 페이지 (welfare/loan/news/blog) SQL 과 동일 구조인지
  4. persona-form 의 client/server boundary 안전 (URL 업데이트만 — server action 0)
  5. 페르소나 6개 정의가 UserSignals 타입 호환

- [ ] **Step 3: 리뷰 결과 반영**

리뷰가 fix 요청 → 같은 commit 에 반영. 통과 시 다음 task.

---

## Task 11: 단일 commit + 사장님 push 승인

- [ ] **Step 1: 변경사항 사장님께 미리보기**

Run: `git diff -- lib/personalization/score.ts lib/admin/menu.ts`

Expected: score.ts +2 (export 키워드만), menu.ts +1 (메뉴 항목).

신규 5 파일은 `git status --short` 로 확인. 사장님께 변경 요약 출력.

- [ ] **Step 2: 단일 commit**

Run:
```bash
git add lib/personalization/score.ts lib/personalization/diagnostic.ts \
  __tests__/personalization/diagnostic.test.ts \
  app/admin/recommendation-trace/personas.ts \
  app/admin/recommendation-trace/trace-area.ts \
  app/admin/recommendation-trace/persona-form.tsx \
  app/admin/recommendation-trace/page.tsx \
  lib/admin/menu.ts

git commit -m "$(cat <<'EOF'
feat(admin): 추천 시스템 진단 도구 (/admin/recommendation-trace)

옵션 D (architecture 재검토) 첫 spec 의 implementation.
사장님 본인 + 가상 페르소나 6개 × welfare/loan/news/blog 4 영역의
노출/차단 패턴을 측정. 추측 기반 fix 누적 차단.

- lib/personalization/diagnostic.ts (신규): traceScore + summarizeTrace
  + BlockReason 8 종 (shown/below_min_score/no_signal/cohort_mismatch/
  regional_gate/household_gate/business_mismatch/income_gate)
- lib/personalization/score.ts: isCohortMismatch + buildProgramText export
  (로직 변경 0, 진단용 internal helper 노출)
- app/admin/recommendation-trace/{personas,trace-area,persona-form,page}.ts
- 단위 테스트 8 케이스 (차단 사유 분류 + summary)
- 사이드 메뉴 "추천 진단" 항목 (그룹 4 지표·분석)

검증: npm test 502+ PASS, lint/tsc 0 error.

다음 단계 산출물: 6 페르소나 × 4 영역 = 28 케이스 baseline →
옵션 D snapshot framework 또는 옵션 B cohort 재설계 spec 입력.

연관: docs/superpowers/specs/2026-05-06-recommendation-trace-design.md
연관: docs/superpowers/plans/2026-05-06-recommendation-trace.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 사장님 명시 push 승인 받기**

"master 에 push 해도 될까요?" 질문 후 명시 승인 ("ok push", "푸시해줘") 받기 전엔 push X.

- [ ] **Step 4: master 에 push (승인 후)**

Run: `git push origin master`

- [ ] **Step 5: Vercel 배포 후 사장님 검증 안내**

배포 완료 후 사장님께:
- `/admin/recommendation-trace` 방문
- 페르소나 1 (본인) → 4 카드 확인 + cohort 차단 정책 false positive 의심 케이스 살펴봄
- 페르소나 2-6 클릭 → 각 cohort 가 의도대로 차단/노출 되는지
- 결과 메모해서 다음 spec (옵션 D snapshot 또는 옵션 B cohort 재설계) 입력으로 사용

---

## Self-Review (작성자 inline 점검)

**1. Spec 커버리지**

| Spec 섹션 | 구현 task |
|---|---|
| 3.1 아키텍처 (4 영역 fetch + trace) | Task 5 + 7 |
| 3.2 컴포넌트 5 신규 파일 | Task 3, 4, 5, 6, 7 |
| 3.3 페르소나 6개 | Task 4 |
| 3.4 traceScore + BlockReason | Task 3 |
| 3.5 화면 구성 (4 카드 + 차트 + 목록) | Task 7 |
| 3.6 데이터 흐름 (Promise.all 병렬) | Task 7 |
| 3.7 에러 처리 (Promise.allSettled 변형) | Task 5 (try/catch per area), Task 7 (signals null fallback) |
| 3.8 단위 테스트 8 케이스 | Task 2 |
| 4. 영향 받는 파일 6개 | Task 1, 3, 4, 5, 6, 7, 8 (score.ts + menu.ts 수정 포함) |
| 5. 안전 가드 | Task 1 (score.ts 변경 1줄), Task 7 (admin guard) |

**2. Placeholder 스캔**: TBD/TODO 없음. 모든 코드 블록 실제 코드.

**3. Type 일관성**: `BlockReason`, `ScoreTrace`, `TraceSummary`, `Persona`, `PersonaId`, `AreaName`, `AreaResult` 모두 동일 이름 일관 사용. `MIN_SCORES.welfare = 8` 등 영역 키 일치.

**4. 무관 변경 처리**: 본 plan 의 8 파일 외 추가 변경 없음. 미커밋 변경 워킹 트리에 없는 상태에서 진행 권장.
