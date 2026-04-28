# Phase 3 — AI 진단 인라인 wizard 설계 (Hero 우측)

**작성일**: 2026-04-28
**대상**: keepioo.com 홈 Hero 우측 비로그인 사용자 카드
**범위**: HomeRecommendCard (3선택 폼) → AI 진단 wizard (5문항) 교체. 가입 funnel 단축

---

## 1. 동기

사이트 업그레이드 6 phase 중 Phase 3 (UX-2). 메모리 next_steps 후보 "AI 진단 인라인 임베드 — quiz 로직 분리 + Hero 우측 결과 카드 미리보기" 의 정밀화.

현재 상태:
- /quiz 가 익명 5문항 페이지로 이미 존재 (Phase 1.5 의 income/household 매칭 활용)
- 홈 Hero 우측은 비로그인에 HomeRecommendCard (3 선택 폼) 노출
- 두 funnel 이 본질적으로 같음 (조건 입력 → 매칭 결과) → 사용자 혼란

목표: wizard 임베드로 통합 — 비로그인 사용자가 홈에서 즉시 진단 시작, 5문항 답하면 /quiz 결과 페이지로 자연 진입.

---

## 2. 자리·분기 (변경 X)

```
- 비로그인:    HomeRecommendCard       → QuizInlineWizard (변경)
- 로그인+빈:   EmptyProfilePrompt      → 그대로
- 로그인+있음: HomeRecommendAuto       → 그대로
```

로그인 사용자는 이미 프로필 있어 진단 불필요. 비로그인만 wizard 노출.

---

## 3. wizard UX

### 3.1 5문항 순서 (quiz 페이지 동일)

| step | 질문 | 옵션 | 형태 |
|---|---|---|---|
| 1 | 연령대 | 6 옵션 (20대 미만 ~ 60대+) | 단일 선택 |
| 2 | 지역 + 시·군·구 | 17 광역 + 광역별 district list | 단일 선택 (region 선택 후 district 자동 노출) |
| 3 | 직업 | 5~6 옵션 | 단일 선택 |
| 4 | 소득 | 5 옵션 (포함: "잘 모름" → skip) | 단일 선택 |
| 5 | 가구 상태 | 6 옵션 | 다중 선택 (skip 가능) |

**step 2 동작**: region 단일 선택 → 카드 안에서 즉시 district list 노출 (스크롤 가능 grid). district 도 단일 선택 (광역 자체 = "전체" 옵션 가능). 패턴은 `app/onboarding/steps/step-region.tsx` 재사용. 정밀 매칭으로 지자체 정책 결과 풀.

### 3.2 동작

- **답 선택 즉시 자동 다음** (1·3·4 단계 — 단일 선택, 즉시 next)
- **2단계 (지역+district)**: region 선택해도 즉시 다음 X — district 노출 → district 선택 후 자동 next (또는 "전체" 옵션 클릭)
- **5단계만 "결과 보기" 버튼** (다중 선택 끝났다 신호 필요)
- **진행 표시줄** (얇은 blue bar, 1/5 ~ 5/5)
- **"← 이전" 버튼** (실수 시, 1단계에선 disabled)
- **"건너뛰기"** (소득·가구 단계만 — 답 없이도 next)
- **마지막 답 후**:
  1. `setQuizPrefill(answers)` 쿠키 저장 (가입 시 prefill 활용)
  2. `router.push('/quiz?age=...&region=...&district=...&occupation=...&income=...&household=...')` (서버 매칭 결과). district 가 빈 값이면 query 에서 생략.

### 3.3 시각

- 카드 디자인 — 기존 HomeRecommendCard 의 흰 배경 + rounded-3xl + shadow-lg 패턴 유지
- 헤더:
  - 제목: "내 자격 1분 진단"
  - 서브: "5문항 익명 — 가입 불필요"
- 진행 표시줄 (얇은 blue-500 bar, 1/5 시 20%, 2/5 시 40%, ...)
- 본문:
  - 현재 step 질문 (text-[16px] font-semibold text-grey-900)
  - 옵션 그리드 (2 cols 모바일, 3 cols 데스크톱)
  - 옵션 버튼: rounded-xl px-4 py-3 border + hover blue-50 + selected blue-500 background
- 푸터:
  - 좌: "← 이전" (text-grey-500)
  - 우: 1~4 단계 → 자동 next 라 버튼 X / 5단계 → "결과 보기" CTA (blue-500)

### 3.4 새로고침 처리

새로고침 시 state 잃음 (복원 X). 단순함 우선. localStorage 임시 저장은 후속 검토 (사용자 abandon 비율 보고 결정).

---

## 4. 컴포넌트 구조

**신규**: `components/quiz-inline-wizard.tsx` (client component, ~150~180라인)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setQuizPrefill } from "@/lib/quiz-prefill";
import { trackEvent, EVENTS } from "@/lib/analytics";
import {
  AGE_OPTIONS, REGION_OPTIONS, OCCUPATION_OPTIONS,
  INCOME_OPTIONS, HOUSEHOLD_OPTIONS,
  type AgeOption, type RegionOption, type OccupationOption,
  type IncomeOption, type HouseholdOption,
} from "@/lib/profile-options";

type Answers = {
  age: AgeOption | null;
  region: RegionOption | null;
  district: string | null;     // step 2 의 region 선택 후 노출되는 시·군·구
  occupation: OccupationOption | null;
  income: IncomeOption | null;
  household: HouseholdOption[];
};

const STEPS = [
  { key: "age", title: "연령대를 알려주세요", options: AGE_OPTIONS },
  { key: "region", title: "어느 지역에 사세요?", options: REGION_OPTIONS },
  { key: "occupation", title: "직업을 알려주세요", options: OCCUPATION_OPTIONS },
  { key: "income", title: "소득은 어느 정도인가요?", options: INCOME_OPTIONS },
  { key: "household", title: "가구 상태를 모두 골라주세요", options: HOUSEHOLD_OPTIONS },
] as const;

export function QuizInlineWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>({
    age: null, region: null, district: null, occupation: null, income: null, household: [],
  });
  const [started, setStarted] = useState(false);

  // ... select handler / next / back / finish
}
```

**수정**: `app/page.tsx`
- import HomeRecommendCard → QuizInlineWizard
- 비로그인 분기에서 사용

**삭제 검토**: `components/home-recommend-card.tsx`
- grep 으로 사용처 확인 후 0이면 삭제

---

## 5. quiz prefill 통합

기존 코드: `lib/quiz-prefill.ts` (이미 존재) — quiz answers 를 쿠키에 저장 → /signup 시 onboarding prefill.

wizard 도 동일 패턴:
1. 5문항 답 완료 → `setQuizPrefill({ age, region, occupation, income, household })` 호출
2. `router.push('/quiz?...')` 로 이동
3. /quiz 결과 페이지 → "더 정확한 알림 받기" CTA → /signup
4. /signup → onboarding 진입 시 quiz_prefill 쿠키 읽어 자동 채움 (기존 동작)

→ wizard 추가 코드 0 (기존 lib 재사용).

---

## 6. GA4 이벤트

- `QUIZ_INLINE_STARTED` — Hero wizard 첫 답 클릭 시
- `QUIZ_INLINE_COMPLETED` — 5문항 모두 답하고 "결과 보기" 클릭 시
- 기존 `QUIZ_PREFILL_APPLIED` 자동 발사 (기존 onboarding 흐름)

abandoned 이벤트는 step 별로 너무 detail — 후속 검토 (필요 시).

---

## 7. 검증·롤백

### 검증
- chrome 모바일 (390×844) 5문항 완주 시뮬레이션 → /quiz 결과 페이지 진입
- 데스크톱 (1280×800) 시각 회귀 0
- 진행 표시줄·이전 버튼 동작
- 5문항 도중 새로고침 → 1단계로 reset (복원 X 의도)
- HomeRecommendCard 삭제 시 기존 사용처 검증 (grep)
- lighthouse 점수 회귀 < 5점

### 회귀 trigger (즉시 revert)
- 비로그인 사용자가 홈 진입 시 wizard 노출 안 됨 (분기 실패)
- 마지막 "결과 보기" 클릭 후 /quiz 가 답변 받지 못함 (쿼리 형식 오류)
- HomeRecommendCard 삭제 후 다른 페이지 import 깨짐

---

## 8. 의존성·리스크

### 의존성
- `lib/profile-options.ts` (옵션 정의 재사용)
- `lib/quiz-prefill.ts` (쿠키 저장 재사용)
- `lib/analytics.ts` (GA4 트래킹 재사용)

### 리스크

| 리스크 | 완화책 |
|---|---|
| HomeRecommendCard 삭제 시 다른 페이지 깨짐 | grep 으로 사용처 검증, 0 이면 삭제 / 1+ 이면 보존 |
| wizard 가 모바일 화면 너무 큼 | 옵션 그리드 컴팩트 (px-3 py-2.5), 카드 max-h scroll |
| 비로그인 사용자가 wizard 도중 가입하면 답 잃음 | quiz-prefill 쿠키로 자동 prefill |
| 진단 결과 후 사용자가 "더 정확한 알림" 가입 안 하면 funnel 멈춤 | /quiz 결과 페이지의 가입 CTA 강화 (별도 phase) |
| 새로고침 시 state 손실 | localStorage 복원은 후속 (단순성 우선) |

---

## 9. 성공 기준

- ✅ 비로그인 홈 → Hero 우측 wizard 노출
- ✅ 5문항 자동 next + 마지막 "결과 보기" → /quiz 결과 진입
- ✅ 데스크톱 회귀 0
- ✅ HomeRecommendCard 사용처 검증 후 깨끗히 삭제 (또는 보존)
- ✅ lighthouse -5 이내
- ✅ chrome console 에러 0

위 6개 모두 충족 시 Phase 3 완료.
