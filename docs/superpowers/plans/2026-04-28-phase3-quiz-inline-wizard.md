# Phase 3 — AI 진단 인라인 wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo 홈 Hero 우측 비로그인 사용자 카드를 HomeRecommendCard (3선택 폼) → AI 진단 wizard (5문항, district 포함) 로 교체. 답하면 /quiz 결과 페이지로 redirect.

**Architecture:** client component wizard (state 5문항) + 마지막 답 후 query string 으로 /quiz redirect (서버 매칭 재사용). quiz-prefill 쿠키에 district 추가해 가입 funnel prefill 까지 일관.

**Tech Stack:** Next.js 16 client component, useState, useRouter, lib/profile-options (AGE_OPTIONS·REGION_OPTIONS·getDistrictsForRegion·OCCUPATION·INCOME·HOUSEHOLD), lib/quiz-prefill, lib/analytics

**Spec:** `docs/superpowers/specs/2026-04-28-phase3-quiz-inline-wizard-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `lib/quiz-prefill.ts` | modify | QuizPrefill type 에 district 필드 추가 + parseQuizPrefill 갱신 |
| `app/quiz/page.tsx` | modify | searchParams 의 district 읽어 signals 에 채움 |
| `components/quiz-inline-wizard.tsx` | create | 신규 client component (5 step wizard, 진행 표시줄, 자동 next) |
| `app/page.tsx` | modify | import HomeRecommendCard → QuizInlineWizard, 비로그인 분기 변경 |
| `lib/analytics.ts` | modify | 신규 이벤트 2개 (QUIZ_INLINE_STARTED·COMPLETED) |
| `components/home-recommend-card.tsx` | (검토) | 사용처 grep 후 0이면 삭제, 1+ 이면 보존 |

총 5~6 파일.

---

## Task 1: quiz-prefill 에 district 필드 추가

**Files:** `lib/quiz-prefill.ts`

- [ ] **Step 1.1: QuizPrefill type 에 district 추가**

`lib/quiz-prefill.ts:31` 의 type 변경:

```ts
export type QuizPrefill = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  district: string | null;       // 신규 — 시·군·구 (광역 선택 후 노출)
  occupation: OccupationOption | null;
  incomeLevel: IncomeOption | null;
  householdTypes: HouseholdOption[];
};
```

- [ ] **Step 1.2: parseQuizPrefill 함수에 district 파싱 추가**

`lib/quiz-prefill.ts:59` 의 parseQuizPrefill 안 result 객체 변경:

```ts
const result: QuizPrefill = {
  ageGroup: pickEnum(obj.ageGroup, AGE_OPTIONS),
  region: pickEnum(obj.region, REGION_OPTIONS),
  district: typeof obj.district === 'string' ? obj.district : null,
  occupation: pickEnum(obj.occupation, OCCUPATION_OPTIONS),
  incomeLevel: pickEnum<IncomeOption>(obj.incomeLevel, incomeAllowed),
  householdTypes: pickHouseholds(obj.householdTypes),
};
```

empty 검사도 district 추가:

```ts
const empty =
  !result.ageGroup &&
  !result.region &&
  !result.district &&
  !result.occupation &&
  !result.incomeLevel &&
  result.householdTypes.length === 0;
```

- [ ] **Step 1.3: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: error 0. (district 필드 추가로 onboarding 의 prefill 사용처가 깨질 수 있음 — 깨지면 해당 파일 보완 필요)

만약 onboarding/page.tsx 또는 onboarding-flow.tsx 가 prefill.district 를 안 사용해도 type error 안 남 (optional 추가 X, 명시 추가). 단순히 새 필드 추가니 호환 OK.

- [ ] **Step 1.4: 커밋**

```bash
git add lib/quiz-prefill.ts
git commit -m "feat(quiz-prefill): QuizPrefill 에 district 필드 추가 (Phase 3 wizard 대비)"
```

---

## Task 2: /quiz 가 searchParams 의 district 읽기

**Files:** `app/quiz/page.tsx`

- [ ] **Step 2.1: 현재 /quiz 의 searchParams 처리 확인**

```bash
grep -n 'searchParams\|district' app/quiz/page.tsx | head -20
```

74·166 라인에 `district: null` 가 있음 (signals 객체 안). searchParams 에서 district 받지 않음 — 이 부분 수정.

- [ ] **Step 2.2: /quiz 의 searchParams 파싱 영역 찾기**

`app/quiz/page.tsx:113` 영역 — `const sp = await searchParams;` 직후 다음 라인들 (age·region·occupation·income·household 파싱).

해당 영역 다음에 `district` 파싱 추가 (raw string 그대로):

```ts
const district = typeof sp.district === 'string' ? sp.district : null;
```

- [ ] **Step 2.3: signals 객체에 district 채움**

`app/quiz/page.tsx:74` 와 `:166` 의 `district: null` 두 곳을 다음으로:

```ts
district,
```

(위 Step 2.2 에서 파싱한 변수명 그대로)

- [ ] **Step 2.4: 빌드·타입 검증**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 2.5: 커밋**

```bash
git add app/quiz/page.tsx
git commit -m "feat(quiz): searchParams 의 district 받아 signals 에 반영"
```

---

## Task 3: GA4 신규 이벤트 추가

**Files:** `lib/analytics.ts`

- [ ] **Step 3.1: EVENTS 객체에 2 이벤트 추가**

`lib/analytics.ts` 의 EVENTS 안 (온보딩 영역 근처) 다음 추가:

```ts
// AI 진단 인라인 wizard (Phase 3, Hero 우측 임베드)
QUIZ_INLINE_STARTED: "quiz_inline_started",
QUIZ_INLINE_COMPLETED: "quiz_inline_completed",
```

- [ ] **Step 3.2: 빌드 검증**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

(Task 3 단독 commit 안 함 — Task 4 에서 wizard 컴포넌트 commit 시 함께)

---

## Task 4: QuizInlineWizard client component 작성

**Files:** `components/quiz-inline-wizard.tsx` (신규)

- [ ] **Step 4.1: 파일 생성**

```tsx
"use client";

// Hero 우측 비로그인 사용자용 AI 진단 wizard.
// 5문항 (연령·지역+district·직업·소득·가구) 답하면 /quiz?... 로 이동해
// 서버 매칭 결과 노출. quiz-prefill 쿠키도 함께 저장 → 가입 funnel 자동 prefill.
//
// UX:
//   - 답 선택 즉시 자동 next (1·3·4 단계)
//   - 2단계: region 선택 → district 노출 → district 선택 시 자동 next
//   - 5단계 (가구 다중 선택): "결과 보기" 버튼으로 마무리
//   - 진행 표시줄 (1/5 ~ 5/5)
//   - "← 이전" 버튼 (실수 시), 1단계에선 disabled
//   - "건너뛰기" — 소득(4)·가구(5) 단계만 (답 없이 next)
//
// 새로고침 시 state 잃음 (복원 X — 단순성 우선).

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AGE_OPTIONS,
  REGION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  HOUSEHOLD_OPTIONS,
  getDistrictsForRegion,
  type AgeOption,
  type RegionOption,
  type OccupationOption,
  type IncomeOption,
  type HouseholdOption,
} from "@/lib/profile-options";
import { saveQuizPrefill } from "@/lib/quiz-prefill";
import { trackEvent, EVENTS } from "@/lib/analytics";

const TOTAL_STEPS = 5;

type Answers = {
  age: AgeOption | null;
  region: RegionOption | null;
  district: string | null;
  occupation: OccupationOption | null;
  income: IncomeOption | null;
  household: HouseholdOption[];
};

const EMPTY: Answers = {
  age: null,
  region: null,
  district: null,
  occupation: null,
  income: null,
  household: [],
};

export function QuizInlineWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [started, setStarted] = useState(false);

  function ensureStarted() {
    if (!started) {
      setStarted(true);
      trackEvent(EVENTS.QUIZ_INLINE_STARTED, {});
    }
  }

  function next() {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  }

  function back() {
    if (step > 1) setStep((s) => s - 1);
  }

  function finish() {
    trackEvent(EVENTS.QUIZ_INLINE_COMPLETED, {});
    saveQuizPrefill({
      ageGroup: answers.age,
      region: answers.region,
      district: answers.district,
      occupation: answers.occupation,
      incomeLevel: answers.income,
      householdTypes: answers.household,
    });
    const qs = new URLSearchParams();
    if (answers.age) qs.set("age", answers.age);
    if (answers.region) qs.set("region", answers.region);
    if (answers.district) qs.set("district", answers.district);
    if (answers.occupation) qs.set("occupation", answers.occupation);
    if (answers.income) qs.set("income", answers.income);
    if (answers.household.length > 0) qs.set("household", answers.household.join(","));
    router.push(`/quiz?${qs.toString()}`);
  }

  // 단일 선택 옵션 버튼 (age·region·occupation·income·district 공용)
  const selectClass = (selected: boolean) =>
    `px-3 py-2.5 rounded-xl border text-[14px] transition-colors text-left ${
      selected
        ? "bg-blue-500 text-white border-blue-500"
        : "bg-white text-grey-800 border-grey-200 hover:border-blue-300 hover:bg-blue-50"
    }`;

  const districts = answers.region ? getDistrictsForRegion(answers.region) : [];

  return (
    <section className="bg-white rounded-3xl p-6 shadow-lg">
      {/* 헤더 + 진행 표시줄 */}
      <header className="mb-5">
        <h3 className="text-[18px] font-bold text-grey-900">내 자격 1분 진단</h3>
        <p className="text-[13px] text-grey-600 mt-1">
          5문항 익명 — 가입 불필요
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-grey-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <span className="text-[12px] text-grey-500 font-semibold">
            {step}/{TOTAL_STEPS}
          </span>
        </div>
      </header>

      {/* step 1: 연령대 */}
      {step === 1 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            연령대를 알려주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {AGE_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  ensureStarted();
                  setAnswers((p) => ({ ...p, age: a }));
                  next();
                }}
                className={selectClass(answers.age === a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 2: 지역 + district */}
      {step === 2 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            어느 지역에 사세요?
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {REGION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  ensureStarted();
                  setAnswers((p) => ({
                    ...p,
                    region: r as RegionOption,
                    district: null,
                  }));
                }}
                className={selectClass(answers.region === r)}
              >
                {r}
              </button>
            ))}
          </div>
          {districts.length > 0 && (
            <div className="mt-4">
              <h5 className="text-[14px] font-semibold text-grey-700 mb-2">
                시·군·구
              </h5>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((p) => ({ ...p, district: null }));
                    next();
                  }}
                  className={selectClass(answers.district === null && answers.region !== null)}
                >
                  전체
                </button>
                {districts.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setAnswers((p) => ({ ...p, district: d }));
                      next();
                    }}
                    className={selectClass(answers.district === d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* step 3: 직업 */}
      {step === 3 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            직업을 알려주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {OCCUPATION_OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setAnswers((p) => ({ ...p, occupation: o }));
                  next();
                }}
                className={selectClass(answers.occupation === o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 4: 소득 (skip 가능) */}
      {step === 4 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            소득은 어느 정도인가요?
          </h4>
          <div className="space-y-2">
            {INCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAnswers((p) => ({ ...p, income: opt.value }));
                  next();
                }}
                className={selectClass(answers.income === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 5: 가구 (다중 선택) */}
      {step === 5 && (
        <div>
          <h4 className="text-[16px] font-semibold text-grey-900 mb-3">
            가구 상태를 모두 골라주세요
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {HOUSEHOLD_OPTIONS.map((opt) => {
              const selected = answers.household.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setAnswers((p) => ({
                      ...p,
                      household: selected
                        ? p.household.filter((h) => h !== opt.value)
                        : [...p.household, opt.value],
                    }));
                  }}
                  className={selectClass(selected)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 푸터 — 이전 / (마지막만) 결과 보기 */}
      <footer className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 1}
          className="text-[14px] text-grey-500 hover:text-grey-700 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 border-none bg-transparent cursor-pointer"
        >
          ← 이전
        </button>
        {(step === 4 || step === 5) && (
          <button
            type="button"
            onClick={() => {
              if (step === 5) finish();
              else next();
            }}
            className="text-[14px] font-semibold text-white bg-blue-500 hover:bg-blue-600 px-5 py-2.5 rounded-full border-none cursor-pointer transition-colors"
          >
            {step === 5 ? "결과 보기 →" : "건너뛰기"}
          </button>
        )}
      </footer>
    </section>
  );
}
```

**중요 검토 포인트**:
- `OCCUPATION_OPTIONS` 가 string[] 인지 `{value, label}[]` 인지 확인 — string[] 라면 위 코드 그대로, 객체 array 라면 `opt.label`/`opt.value` 패턴.
- `getDistrictsForRegion` 의 반환 type 이 `string[]` 인지 확인.

→ 코드 작성 후 `bunx tsc --noEmit` 으로 즉시 검증.

- [ ] **Step 4.2: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: error 0. error 발생 시 OCCUPATION/INCOME/HOUSEHOLD type 확인 후 매칭 코드 정정.

- [ ] **Step 4.3: 빌드 검증**

```bash
bun run build 2>&1 | tail -5
```

Expected: error 0.

(Task 4 도 단독 commit X — Task 5 의 page.tsx 변경과 함께 commit)

---

## Task 5: app/page.tsx 의 비로그인 분기 변경

**Files:** `app/page.tsx`

- [ ] **Step 5.1: import 변경**

`app/page.tsx:6` 영역 (HomeRecommendCard import) 변경:

```ts
// 변경 전
import { HomeRecommendCard } from "@/components/home-recommend-card";

// 변경 후 — Phase 3 wizard 로 교체
import { QuizInlineWizard } from "@/components/quiz-inline-wizard";
```

`HomeRecommendCard` 의 다른 사용처가 page.tsx 안에 있는지 확인:

```bash
grep -n 'HomeRecommendCard' app/page.tsx
```

만약 1곳 (비로그인 분기) 만 사용한다면 깨끗히 교체. 다른 곳에서 사용 중이면 import 둘 다 유지.

- [ ] **Step 5.2: 비로그인 분기 컴포넌트 변경**

`app/page.tsx` 의 Hero 우측 분기 (메모리 기준 line 200~213 영역, `{user ? ... : <HomeRecommendCard initial={initialProfile} />}`):

기존:
```tsx
) : (
  // 비로그인 — 기존 입력 폼 그대로 (변화 없음)
  <HomeRecommendCard initial={initialProfile} />
)}
```

변경:
```tsx
) : (
  // 비로그인 — AI 진단 wizard (Phase 3, 5문항 익명)
  <QuizInlineWizard />
)}
```

- [ ] **Step 5.3: initialProfile 사용처 검증**

기존 비로그인 분기가 `initial={initialProfile}` 받았는데, wizard 는 안 받음. initialProfile 변수가 page.tsx 안에 다른 사용처 있는지 확인:

```bash
grep -n 'initialProfile' app/page.tsx
```

다른 사용처 없고 비로그인 분기만 사용했으면 `initialProfile` 변수 선언·계산 로직 삭제 가능 (line 43~57 영역). 다만 이 단계는 정리 작업이라 Phase 3 의 핵심 외 — 후속 cleanup 으로 미루는 것도 OK.

**판단**: initialProfile 계산 로직 삭제. wizard 는 익명이라 필요 없음. 코드 다이어트.

해당 영역 (43~57 line, `let initialProfile: ProfileLite | null = null; if (user) { ... }`) 전체 삭제. 그리고 `import { ..., type ProfileLite } from "@/lib/programs";` 의 ProfileLite 도 다른 사용처 없으면 import 정리.

```bash
grep -n 'ProfileLite\|initialProfile' app/page.tsx
```

→ 모두 삭제 가능하면 정리.

- [ ] **Step 5.4: 빌드·타입 검증**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 5.5: 커밋 (Task 3·4·5 모두 함께)**

```bash
git add lib/analytics.ts components/quiz-inline-wizard.tsx app/page.tsx
git commit -m "feat(home): AI 진단 인라인 wizard (Hero 우측 5문항·district 포함)"
```

---

## Task 6: HomeRecommendCard 사용처 검증 + 삭제 결정

**Files:** `components/home-recommend-card.tsx` (검토)

- [ ] **Step 6.1: 사용처 grep**

```bash
grep -rn 'HomeRecommendCard\|home-recommend-card' app/ components/ 2>/dev/null | grep -v '\.lighthouse'
```

Expected:
- `app/page.tsx` 의 import 가 이미 Task 5 에서 제거됨 → 출력 0이면 삭제 가능
- 다른 페이지·컴포넌트가 사용 중이면 출력에 보임 → 보존

- [ ] **Step 6.2a: 사용처 0 — 파일 삭제**

```bash
git rm components/home-recommend-card.tsx
git commit -m "chore(cleanup): HomeRecommendCard 삭제 (Phase 3 wizard 로 대체 후 사용처 0)"
```

- [ ] **Step 6.2b: 사용처 1+ — 보존 (커밋 X)**

다른 페이지에서 사용 중이면 그대로 두고 다음 task 로.

---

## Task 7: 검증 + push

- [ ] **Step 7.1: prod build 기동 + chrome 모바일 검증**

```bash
PORT=3100 bun run start &
sleep 3
```

playwright 또는 사장님 chrome (모바일 390×844):
- 비로그인 상태로 홈 접속 → Hero 우측 wizard 노출 확인
- step 1 (연령대) 옵션 클릭 → 자동 step 2
- step 2 → region 칩 클릭 → district list 노출 → district 클릭 → 자동 step 3
- step 3 (직업) → 자동 step 4
- step 4 (소득) → 자동 step 5 또는 "건너뛰기"
- step 5 (가구 다중) → "결과 보기" 클릭 → /quiz?... 페이지로 이동 + 결과 노출
- "← 이전" 버튼 동작 (1단계에선 disabled)

- [ ] **Step 7.2: 데스크톱 회귀 0**

데스크톱 1280×800 → Hero 좌측·우측 자연스럽게 보임. wizard 카드 너무 크지 않음.

- [ ] **Step 7.3: 콘솔 에러 0**

playwright `browser_console_messages` 또는 사장님 devtools.

- [ ] **Step 7.4: 로그인 사용자 회귀 검증**

로그인 후 홈 → Hero 우측이 wizard 가 아닌 HomeRecommendAuto 또는 EmptyProfilePrompt 노출 (변경 X).

- [ ] **Step 7.5: prod 서버 종료**

PowerShell 로 PID kill:
```
Stop-Process -Id <PID> -Force
```

- [ ] **Step 7.6: push (사장님 명시 후)**

```bash
git push origin master
```

- [ ] **Step 7.7: 메모리 갱신**

`~/.claude/projects/.../memory/project_keepioo_phase3_quiz_inline_2026_04_28.md` 신설 + MEMORY.md 인덱스 추가:
- 변경 영역 (5 파일)
- 핵심 commits
- 검증 결과
- 다음 phase 추천 (Phase 4 수익화)

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 자리·분기 | Task 5 | ✅ |
| Section 2 wizard UX (5문항·자동next·district·진행표시줄·이전·건너뛰기) | Task 4 | ✅ |
| Section 3 컴포넌트 구조 (신규 wizard·page.tsx 변경) | Task 4·5 | ✅ |
| Section 4 quiz prefill 통합 | Task 1·4 (wizard 안 saveQuizPrefill 호출) | ✅ |
| Section 5 GA4 이벤트 (STARTED·COMPLETED) | Task 3·4 | ✅ |
| Section 6 검증·롤백 | Task 7 | ✅ |
| HomeRecommendCard 삭제 검토 | Task 6 | ✅ |

빠짐 없음. 추가 task: Task 2 (/quiz 의 district query 처리) — spec 에 명시 안 했지만 wizard 가 district 보내도 /quiz 가 받지 않으면 효과 0 → 필수. 추가됨.

### 2. 회귀 가드
- 각 task 후 typecheck (Step 1.3·2.4·4.2)
- 시각 회귀 검증 (Step 7.1~4)
- 로그인 사용자 분기 회귀 검증 (Step 7.4)
- HomeRecommendCard 사용처 검증 (Step 6.1)

### 3. Type 일관성
- `Answers` type — wizard 내부, 일관
- `QuizPrefill` type — district 추가 (Task 1), wizard 의 saveQuizPrefill 호출 (Task 4) 시그니처 일치
- /quiz 의 searchParams.district (Task 2) ↔ wizard 의 query string `district=` (Task 4) 매칭

### 4. 위험 요소

- **OCCUPATION_OPTIONS 가 객체 array 일 가능성** — string[] 가정으로 코드 작성. 실제로 객체면 `.label` `.value` 패턴 적용 필요. Task 4.2 의 typecheck 에서 즉시 발견.
- **getDistrictsForRegion 반환 type** — string[] 가정. typecheck 에서 검증.
- **HomeRecommendCard 삭제로 다른 페이지 깨짐** — Task 6.1 grep 으로 사전 검증.
- **wizard 새로고침 시 state 손실** — 의도된 단순화. 사용자 abandon 비율 보고 후속 결정.

---

## 진행 후 보고

각 task 완료 후:
```
✅ Task N 완료
- 변경: <파일>, 커밋: <hash>
- typecheck/build 통과
- 다음 task 진행
```

Phase 3 전체 완료 시:
```
✅ Phase 3 완료
- 5~6 commits push
- chrome 시각 검증 통과
- 메모리 갱신
- 다음: Phase 4 수익화 또는 Phase 5/6
```
