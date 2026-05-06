# 추천 score 회귀 방지 snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fixture 정책 18개 × 페르소나 6 매트릭스의 페르소나별 `summarizeTrace` 결과를 vitest snapshot 으로 baseline. score.ts / cohort gate / regional gate 변경 시 `npm test` 가 자동 fail.

**Architecture:** `__tests__/personalization/snapshot-fixtures.ts` 가 fixture 정책 ScorableItem 18개 정의. `snapshot.test.ts` 가 `app/admin/recommendation-trace/personas.ts` 의 6 페르소나 import + `traceScore` 매트릭스 실행 + `summarizeTrace` 결과 `toMatchSnapshot` 검증. 핵심 시나리오 5-6개는 hardcoded assertion.

**Tech Stack:** vitest snapshot / TypeScript / score.ts (변경 0)

연관 spec: `docs/superpowers/specs/2026-05-06-personalization-snapshot-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 | 라인 추정 |
|---|---|---|---|
| `__tests__/personalization/snapshot-fixtures.ts` | 신규 | fixture 정책 18개 (ScorableItem 형식) + 카테고리별 export | ~190 |
| `__tests__/personalization/snapshot.test.ts` | 신규 | 매트릭스 trace + 페르소나별 summary snapshot + 핵심 assertion | ~150 |
| `__tests__/personalization/__snapshots__/snapshot.test.ts.snap` | 신규 (자동 생성) | vitest -u 결과 baseline | ~200 |

기존 score.ts / filter.ts / personas.ts / diagnostic.ts 변경 0.

---

## Task 1: fixture 정책 18개 정의 (`snapshot-fixtures.ts`)

**Files:**
- Create: `__tests__/personalization/snapshot-fixtures.ts`

각 fixture 는 명확한 시나리오 — 어떤 페르소나에게 어떤 BlockReason 으로 차단/노출되어야 하는지 의도 주석 포함.

- [ ] **Step 1: 신규 파일 작성**

다음 내용으로 `__tests__/personalization/snapshot-fixtures.ts` 생성:

```ts
// __tests__/personalization/snapshot-fixtures.ts
// ============================================================
// 추천 score 회귀 방지 snapshot 용 fixture 정책 18개
// ============================================================
// score.ts 의 ScorableItem 형식. 각 fixture 는 의도된 BlockReason 시나리오
// 를 가지고 있어 페르소나 6명을 통과시키면 다양한 분기가 trigger.
//
// 카테고리:
//   - 광역별 (regional_gate): 6
//   - cohort (cohort_mismatch): 6
//   - household_target_tags (household_gate): 3
//   - income_target_level (income_gate): 2
//   - 일반 (강제 차단 신호 없음): 1
//   총 18
// ============================================================

import type { ScorableItem } from "@/lib/personalization/score";

// ─── 광역별 (regional_gate 검증) ─────────────────────────────────────
// 각 정책 region 이 명확한 광역 정식명. 다른 광역 페르소나는 regional_gate 차단.

export const seoulYouthHousing: ScorableItem = {
  id: "fx_seoul_1",
  title: "서울 청년 주거 지원",
  description: "서울 거주 청년 대상 월세 보조",
  region: "서울특별시",
  district: null,
  benefit_tags: ["주거"],
  apply_end: null,
  source: "서울특별시청",
  household_target_tags: null,
  income_target_level: null,
};

export const jeonnamSelfEmployedLoan: ScorableItem = {
  id: "fx_jeonnam_1",
  title: "전남 자영업자 금융 지원",
  description: "전남 거주 자영업자 대상 운영자금 융자",
  region: "전라남도",
  district: null,
  benefit_tags: ["금융", "창업"],
  apply_end: null,
  source: "전라남도청",
  household_target_tags: null,
  income_target_level: null,
};

export const gyeonggiParentingSupport: ScorableItem = {
  id: "fx_gyeonggi_1",
  title: "경기 양육 수당",
  description: "경기 거주 가구 자녀 양육 수당",
  region: "경기도",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "경기도청",
  household_target_tags: null,
  income_target_level: null,
};

export const busanFarmerSupport: ScorableItem = {
  id: "fx_busan_1",
  title: "부산 어촌 지원사업",
  description: "부산 거주 어민 대상 장비 보조",
  region: "부산광역시",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "부산광역시청",
  household_target_tags: null,
  income_target_level: null,
};

export const chungnamMedicalSupport: ScorableItem = {
  id: "fx_chungnam_1",
  title: "충남 의료비 지원",
  description: "충남 거주 가구 의료비 보조",
  region: "충청남도",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "충청남도청",
  household_target_tags: null,
  income_target_level: null,
};

export const nationalEducationSupport: ScorableItem = {
  id: "fx_national_1",
  title: "전국 학자금 대출",
  description: "전국 대학생 대상 학자금 융자",
  region: "전국",
  district: null,
  benefit_tags: ["교육", "금융"],
  apply_end: null,
  source: "교육부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── cohort 차단 (cohort_mismatch 검증) ──────────────────────────────
// 본문에 cohort 키워드 명시 — 해당 cohort 가 아닌 페르소나는 차단.

export const multiculturalSupport: ScorableItem = {
  id: "fx_cohort_multicultural",
  title: "다문화 가정 정착 지원",
  description: "결혼이민자 가족 한국어 교육 및 생활 적응",
  region: "전국",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: null,
  income_target_level: null,
};

export const youthEmployment: ScorableItem = {
  id: "fx_cohort_youth",
  title: "청년 취업 지원",
  description: "만 19~34세 청년 구직자 직업 훈련 및 취업 알선",
  region: "전국",
  district: null,
  benefit_tags: ["취업"],
  apply_end: null,
  source: "고용노동부",
  household_target_tags: null,
  income_target_level: null,
};

export const elderlyHealthcare: ScorableItem = {
  id: "fx_cohort_elderly",
  title: "노인 의료비 지원",
  description: "만 65세 이상 노인 대상 외래·입원 의료비 본인부담 경감",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: null,
};

export const veteranSupport: ScorableItem = {
  id: "fx_cohort_veteran",
  title: "국가유공자 보훈 지원",
  description: "국가유공자 본인 및 유족 대상 의료비·생활 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료", "생계"],
  apply_end: null,
  source: "보훈처",
  household_target_tags: null,
  income_target_level: null,
};

export const childCareSupport: ScorableItem = {
  id: "fx_cohort_child",
  title: "보호아동 양육수당",
  description: "보호아동 위탁가정 및 시설양육 자녀 대상 양육수당",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: null,
  income_target_level: null,
};

export const farmerSupport: ScorableItem = {
  id: "fx_cohort_farmer",
  title: "농어민 영농자금 지원",
  description: "농어민 대상 영농자금 융자",
  region: "전국",
  district: null,
  benefit_tags: ["창업", "금융"],
  apply_end: null,
  source: "농림축산식품부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── household_target_tags 명시 (household_gate 검증) ────────────────

export const singleParentSupport: ScorableItem = {
  id: "fx_household_singleparent",
  title: "한부모 가정 양육비 지원",
  description: "한부모 가정 양육비 + 학용품비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: ["single_parent"],
  income_target_level: null,
};

export const multiChildSupport: ScorableItem = {
  id: "fx_household_multichild",
  title: "다자녀 가구 양육 수당",
  description: "자녀 3명 이상 다자녀 가구 양육 수당",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: ["multi_child"],
  income_target_level: null,
};

export const disabledFamilySupport: ScorableItem = {
  id: "fx_household_disabled",
  title: "장애가구 의료비 지원",
  description: "가구원 중 장애인 있는 가구 대상 의료비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: ["disabled_family"],
  income_target_level: null,
};

// ─── income_target_level 명시 (income_gate 검증) ──────────────────────

export const lowIncomeSupport: ScorableItem = {
  id: "fx_income_low",
  title: "저소득 생계급여",
  description: "기초생활보장수급자 본인부담 경감",
  region: "전국",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: "low",
};

export const midLowIncomeSupport: ScorableItem = {
  id: "fx_income_midlow",
  title: "차상위 의료급여",
  description: "차상위계층 대상 의료비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: "mid_low",
};

// ─── 일반 (강제 차단 신호 없음, score 매칭만 평가) ──────────────────

export const generalEntrepreneurSupport: ScorableItem = {
  id: "fx_general_1",
  title: "소상공인 창업 지원",
  description: "신규 창업 소상공인 대상 컨설팅 및 운영자금",
  region: "전국",
  district: null,
  benefit_tags: ["창업", "금융"],
  apply_end: null,
  source: "중소벤처기업부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── 전체 export (snapshot test 가 매트릭스로 사용) ──────────────────

export const ALL_FIXTURES: ScorableItem[] = [
  seoulYouthHousing,
  jeonnamSelfEmployedLoan,
  gyeonggiParentingSupport,
  busanFarmerSupport,
  chungnamMedicalSupport,
  nationalEducationSupport,
  multiculturalSupport,
  youthEmployment,
  elderlyHealthcare,
  veteranSupport,
  childCareSupport,
  farmerSupport,
  singleParentSupport,
  multiChildSupport,
  disabledFamilySupport,
  lowIncomeSupport,
  midLowIncomeSupport,
  generalEntrepreneurSupport,
];
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`

Expected: 0 error. ScorableItem 타입 호환 확인.

---

## Task 2: snapshot test 작성 + baseline 생성

**Files:**
- Create: `__tests__/personalization/snapshot.test.ts`
- Create: `__tests__/personalization/__snapshots__/snapshot.test.ts.snap` (vitest -u 자동 생성)

- [ ] **Step 1: snapshot test 파일 작성**

다음 내용으로 `__tests__/personalization/snapshot.test.ts` 생성:

```ts
// __tests__/personalization/snapshot.test.ts
// ============================================================
// score 회귀 방지 snapshot — 페르소나 6 × fixture 18 매트릭스
// ============================================================
// summarizeTrace 결과를 vitest snapshot 으로 baseline. score.ts 변경 시
// 분포가 바뀌면 npm test 가 fail. 의도된 변경 시 vitest -u 로 갱신.
//
// 핵심 시나리오 5-6개는 hardcoded assertion — snapshot 분포로는 못 잡는
// "어떤 정책이 어떤 BlockReason 인지" 명시 회귀 차단.
// ============================================================

import { describe, expect, it } from "vitest";
import { traceScore, summarizeTrace } from "@/lib/personalization/diagnostic";
import { PERSONAS } from "@/app/admin/recommendation-trace/personas";
import {
  ALL_FIXTURES,
  singleParentSupport,
  multiChildSupport,
  veteranSupport,
  elderlyHealthcare,
  busanFarmerSupport,
  multiculturalSupport,
} from "./snapshot-fixtures";

const MIN_SCORE = 8;

describe("score 회귀 방지 — 페르소나별 BlockReason 분포 snapshot", () => {
  for (const persona of PERSONAS) {
    it(`페르소나 ${persona.id} (${persona.label}) — fixture 18개 분포`, () => {
      const traces = ALL_FIXTURES.map((p) =>
        traceScore(p, persona.signals, MIN_SCORE),
      );
      const summary = summarizeTrace(traces);
      expect({
        personaId: persona.id,
        personaLabel: persona.label,
        total: summary.total,
        shown: summary.shown,
        blocked: summary.blocked,
        scoreDistribution: summary.scoreDistribution,
      }).toMatchSnapshot();
    });
  }
});

describe("score 회귀 방지 — 핵심 시나리오 hardcoded assertion", () => {
  // 페르소나 5 (40대 경기 한부모 다자녀) — 한부모 정책 노출되어야 함
  it("p5 (한부모 다자녀) → 한부모 정책 shown", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(singleParentSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 5 → 다자녀 정책도 shown
  it("p5 (한부모 다자녀) → 다자녀 정책 shown", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(multiChildSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 6 (보훈) → 보훈 정책 shown (cohort gate 통과)
  it("p6 (보훈) → 보훈 정책 shown", () => {
    const p6 = PERSONAS.find((p) => p.id === "p6")!;
    const r = traceScore(veteranSupport, p6.signals, MIN_SCORE);
    expect(r.blockReason).toBe("shown");
  });

  // 페르소나 4 (대학생 single) → 다자녀 정책 household_gate 차단
  it("p4 (대학생 single) → 다자녀 정책 household_gate", () => {
    const p4 = PERSONAS.find((p) => p.id === "p4")!;
    const r = traceScore(multiChildSupport, p4.signals, MIN_SCORE);
    expect(r.blockReason).toBe("household_gate");
  });

  // 페르소나 5 (경기) → 부산 정책 regional_gate 차단
  it("p5 (경기) → 부산 정책 regional_gate", () => {
    const p5 = PERSONAS.find((p) => p.id === "p5")!;
    const r = traceScore(busanFarmerSupport, p5.signals, MIN_SCORE);
    expect(r.blockReason).toBe("regional_gate");
  });

  // 페르소나 2 (30대 직장인) → 노인 정책 cohort_mismatch
  it("p2 (30대 직장인) → 노인 정책 cohort_mismatch", () => {
    const p2 = PERSONAS.find((p) => p.id === "p2")!;
    const r = traceScore(elderlyHealthcare, p2.signals, MIN_SCORE);
    expect(r.blockReason).toBe("cohort_mismatch");
  });

  // 페르소나 4 (대학생) → 다문화 정책 cohort_mismatch
  it("p4 (대학생) → 다문화 정책 cohort_mismatch", () => {
    const p4 = PERSONAS.find((p) => p.id === "p4")!;
    const r = traceScore(multiculturalSupport, p4.signals, MIN_SCORE);
    expect(r.blockReason).toBe("cohort_mismatch");
  });
});
```

- [ ] **Step 2: snapshot 1차 실행 (baseline 자동 생성)**

Run: `npm test -- snapshot`

Expected: 첫 실행은 모든 snapshot 자동 생성 + PASS. 출력에 "1 written" 또는 "snapshots written" 포함.

만약 핵심 assertion 에서 fail 발생 → score.ts 의 실제 동작과 다름. fix 옵션:
- assertion 의 expected 값을 실제 동작에 맞춰 수정 (production 동작이 정상이라고 판단)
- 또는 fixture 의 정의를 수정 (정책 본문 키워드 추가/제거)

먼저 snapshot 결과를 본 뒤 결정.

- [ ] **Step 3: snapshot 파일 검토**

Run: `git status __tests__/personalization/__snapshots__/`

Expected: `snapshot.test.ts.snap` 파일 1개 신규.

생성된 snapshot 파일을 직접 읽어서 페르소나 6명의 분포가 *합리적* 인지 검토:
- 페르소나 5 (한부모) 가 한부모 정책 shown 인지
- 페르소나 6 (보훈) 의 cohort_mismatch 가 보훈 외 정책에 한정인지
- 광역 mismatch 가 의도대로 작동하는지

검토 결과 의도된 분포면 → commit 에 포함. 의도치 않은 패턴이면 → fixture 또는 score.ts (변경 안 됨이라 fixture 만) 수정.

- [ ] **Step 4: 재실행해서 snapshot match 확인**

Run: `npm test -- snapshot`

Expected: 모두 PASS. "snapshots written" 없음 (이미 존재).

---

## Task 3: 전체 회귀 + lint + tsc

**Files:** (변경 없음 — 검증)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`

Expected: 모든 테스트 PASS (502 + 신규 6 페르소나 snapshot + 7 assertion = 515).

- [ ] **Step 2: lint**

Run: `npm run lint`

Expected: 0 error.

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`

Expected: 0 error.

---

## Task 4: code-reviewer subagent dispatch

사장님 메모리 규칙: push 전 subagent 리뷰 필수.

- [ ] **Step 1: 변경 파일 정리**

Run: `git status --short`

Expected: 신규 3 파일 (`snapshot-fixtures.ts`, `snapshot.test.ts`, `__snapshots__/snapshot.test.ts.snap`).

- [ ] **Step 2: subagent dispatch (Agent 도구, general-purpose)**

다음 prompt 로 dispatch:
- spec / plan 경로
- 변경 3 파일
- 점검 포인트:
  1. fixture 정책 18개가 spec 의 카테고리 분포 (광역 6 / cohort 6 / household 3 / income 2 / 일반 1) 일치하는지
  2. 핵심 assertion 7개가 score.ts 의 실제 동작과 일치 (즉 baseline 이 의도된 분포인지)
  3. snapshot 파일 (auto-generated) 의 분포가 commit 가능한 신뢰 baseline 인지 (예: 모두 0 으로 비어있으면 무의미)
  4. import 경로 (`@/app/admin/recommendation-trace/personas`) 가 vitest 환경에서 동작하는지
  5. score.ts / filter.ts / cohort 파일 변경 0 (read-only 검증)

- [ ] **Step 3: 리뷰 결과 반영**

리뷰 fix 요청 → 같은 commit 에 반영.

---

## Task 5: 단일 commit + 사장님 push 승인

- [ ] **Step 1: 변경 미리보기**

Run: `git status --short; ls __tests__/personalization/__snapshots__/`

Expected: 3 신규 파일.

- [ ] **Step 2: 단일 commit**

Run:
```bash
git add __tests__/personalization/snapshot-fixtures.ts \
  __tests__/personalization/snapshot.test.ts \
  __tests__/personalization/__snapshots__/snapshot.test.ts.snap

git commit -m "$(cat <<'EOF'
test(personalization): score 회귀 방지 snapshot framework

옵션 D 두 번째 spec — fixture 18개 × 페르소나 6 매트릭스의
페르소나별 summarizeTrace 결과를 vitest snapshot 으로 baseline.
score.ts / cohort gate / regional gate 변경 시 npm test 자동 fail.

신규:
- __tests__/personalization/snapshot-fixtures.ts — fixture 18개
  (광역 6 + cohort 6 + household 3 + income 2 + 일반 1)
- __tests__/personalization/snapshot.test.ts — 페르소나 6 분포
  snapshot + 핵심 시나리오 hardcoded assertion 7개
- __tests__/personalization/__snapshots__/snapshot.test.ts.snap

핵심 assertion (큰 사고 라인):
- p5 (한부모) → 한부모/다자녀 정책 shown
- p6 (보훈) → 보훈 정책 shown
- p4 (대학생) → 다자녀 정책 household_gate
- p5 (경기) → 부산 정책 regional_gate
- p2 (30대) → 노인 정책 cohort_mismatch
- p4 (대학생) → 다문화 정책 cohort_mismatch

score.ts / filter.ts / cohort 파일 변경 0 (read-only 검증).

옵션 B (cohort 재설계) 의 안전망 — 다음 spec 진행 시 회귀 자동 감지.

연관: docs/superpowers/specs/2026-05-06-personalization-snapshot-design.md
연관: docs/superpowers/plans/2026-05-06-personalization-snapshot.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 사장님 명시 push 승인**

"master 에 push 해도 될까요?" 질문 후 명시 승인 받기 전엔 push 금지.

- [ ] **Step 4: master push (승인 후)**

Run: `git push origin master`

---

## Self-Review (작성자 inline 점검)

**1. Spec 커버리지**

| Spec 섹션 | 구현 task |
|---|---|
| 3.1 아키텍처 (매트릭스 → snapshot) | Task 2 |
| 3.2 컴포넌트 2 신규 + auto baseline | Task 1, 2 |
| 3.3 fixture 18 (5 카테고리 분포) | Task 1 |
| 3.4 페르소나별 summary snapshot | Task 2 |
| 3.5 핵심 assertion 5-6개 | Task 2 (실제 7개로 풍부화) |
| 3.6 baseline 갱신 (vitest -u) | Task 2 step 2 + 가이드 안내 |
| 3.7 CI 통합 (npm test 자동) | Task 3 |
| 5. 안전 가드 | Task 4 (review) |

**2. Placeholder 스캔**: 코드 블록 모두 실제. TBD/TODO 없음.

**3. Type 일관성**: `ScorableItem`, `traceScore`, `summarizeTrace`, `PERSONAS` 모두 동일 이름. fixture export 이름이 snapshot.test.ts 에서 그대로 import.

**4. 무관 변경 처리**: working tree 가 깨끗한 상태에서 진행 권장 — 본 plan 의 3 신규 파일 외 변경 0.
