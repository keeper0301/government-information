# 추천 시스템 진단 도구 (`/admin/recommendation-trace`) 설계

작성일: 2026-05-06
컨텍스트: commit `913440b` (4 영역 추천 hot-fix) 직후. 옵션 D Architecture 재검토의 첫 번째 spec.

## 1. 배경

`lib/personalization/score.ts` 와 cohort gate 시스템에 최근 2주간 11+ 개의 fix commit 누적 (`b26a937`, `0b55f02`, `bc2b27a`, `611983c`, `2a3562c`, `f995ae2`, `19bb974`, `3ce58c1`, `05a2323`, `723ba31`, `c628da4`...). 매번 cohort gate 추가 → 다른 영역 회귀 → 또 fix → 또 회귀 패턴.

2026-05-06 사장님 사고 보고 ("4 영역 추천 모두 엉터리야") 진단 결과 5 root cause 식별:

1. 홈 below-the-fold "최근 정책 소식·블로그" personalization 0% — **fix 됨 (commit 913440b)**
2. `/recommend` 보조 섹션 (`getRelatedNews`/`getRelatedBlogs`) gate 우회 — **fix 됨**
3. household gate 가 married 사용자에게 한부모/다자녀 정책 차단 (의도 vs false negative trade-off) — **데이터 정합성 의심, 미해결**
4. news/loan region 합성 로직이 부처명 / title prefix 빈 케이스에서 regional gate 우회 — **의도된 동작**
5. 워킹 트리 미커밋 WOMEN_ONLY_COHORT 광범위 false positive — **rollback 됨**

핵심 미해결 요소: **cohort gate 본문 substring 정규식의 false positive 패턴**. "여성취업" 같은 키워드가 정책 본문에 한 번이라도 등장하면 모든 사용자에게 차단됨. 이 패턴이 11+ commit 회귀 누적의 근본 원인.

### 진단 부재 — 추측 기반 수정 누적

지금까지 모든 fix 가 *추측 기반*: 사장님 한 번 사고 보고 → cohort 한 종 추가 → 다른 영역 회귀 → 또 추가. 데이터 측정 없이 코드만 변경.

## 2. 목표

- **추측을 데이터로** — 실제 사장님 본인 + 가상 페르소나 6개의 노출/차단 정책 비율, 차단 사유, 점수 분포를 *측정*
- **False positive / negative 패턴 식별** — cohort gate 의 광범위 substring 매칭이 실제로 어떤 정상 정책을 잘못 차단하는지 데이터로 노출
- **다음 spec (옵션 D snapshot framework, 옵션 B cohort 재설계) 의 입력** — 6 페르소나 × 4 영역 = 24 케이스 baseline 확보
- **운영 도구로 재사용** — 향후 cohort 추가/정책 등록 시 사장님이 직접 회귀 검증

### 비목표 (Out of Scope)

- 실제 cohort gate 재설계 (옵션 B 의 별도 spec)
- snapshot 테스트 framework (옵션 D 의 별도 spec)
- score.ts / filter.ts 내부 로직 변경 (트레이스만, 변경 X)
- 사용자 노출 페이지 변경 X (어드민 전용)

## 3. 설계

### 3.1 아키텍처

```
[프로필 입력]
   ├ 사장님 본인 (auth user → loadUserProfile)
   ├ 가상 페르소나 6개 (lookup)
   └ 직접 입력 (form)
        ↓ UserSignals
   ├─ welfare pool fetch (~100건)
   ├─ loan pool fetch (~100건)
   ├─ news pool fetch (~100건)
   └─ blog pool fetch (~100건)
        ↓ 각 영역별 병렬
   각 정책 → traceScore() → { score, signals, blockReason }
        ↓ 4 카드 + 차트 + 목록 렌더
   [어드민 화면]
```

### 3.2 컴포넌트 (신규 5 파일)

| 파일 | 책임 | 라인 추정 |
|---|---|---|
| `app/admin/recommendation-trace/page.tsx` | 어드민 페이지 entry · 4 영역 카드 렌더 | ~250 |
| `app/admin/recommendation-trace/personas.ts` | 가상 페르소나 6 개 정의 (UserSignals 형식) | ~80 |
| `app/admin/recommendation-trace/persona-form.tsx` | 클라이언트 폼 (페르소나 선택 / 직접 입력) | ~120 |
| `lib/personalization/diagnostic.ts` | `traceScore` · `classifyBlockReason` · `summarizeTrace` | ~150 |
| `__tests__/personalization/diagnostic.test.ts` | 단위 테스트 — cohort/regional/household 차단 사유 분류 | ~80 |

### 3.3 가상 페르소나 6 개

각 페르소나가 서로 다른 cohort gate 를 트리거하도록 설계 — 다양한 false positive / negative 패턴 노출.

| # | 페르소나 | ageGroup | region | occupation | householdTypes | hasChildren | merit | 트리거 cohort |
|---|---|---|---|---|---|---|---|---|
| 1 | 사장님 본인 | (DB fetch) | (DB fetch) | (DB fetch) | (DB fetch) | (DB fetch) | (DB fetch) | (실제 입력) |
| 2 | 30대 서울 직장인 신혼 | 30대 | 서울 | 직장인 | [married] | null | null | 신혼·직장인·청년 |
| 3 | 60대 부산 농어민 자녀동반 | 60대 | 부산 | 농어민 | [] | true | null | 노년·농어민·아동 |
| 4 | 20대 서울 대학생 single | 20대 | 서울 | 대학생 | [single] | false | null | 청년·대학생·single |
| 5 | 40대 경기 한부모 다자녀 | 40대 | 경기 | 직장인 | [single_parent, multi_child] | true | null | 한부모·다자녀·아동 |
| 6 | 50대 충남 장애가구 보훈 | 50대 | 충남 | 직장인 | [disabled_family] | null | merit | 장애·보훈 |

페르소나 정의는 `personas.ts` 의 상수 export — 향후 페르소나 추가 시 한 곳에서 관리.

### 3.4 진단 핵심 함수 (`lib/personalization/diagnostic.ts`)

```ts
export type BlockReason =
  | "shown"             // score >= minScore, 노출
  | "below_min_score"   // score 1~minScore-1 (signals 있지만 점수 부족)
  | "no_signal"         // score 0 (signals 없음, gate 차단 아님)
  | "cohort_mismatch"   // isCohortMismatch 차단
  | "regional_gate"     // 광역 mismatch
  | "household_gate"    // household_target_tags vs user.householdTypes 교집합 0
  | "business_mismatch" // business 자격 미달
  | "income_gate";      // 자격 미달

export type ScoreTrace = {
  programId: string;
  programTitle: string;
  score: number;
  signals: ScoreSignal[];   // score.ts 의 ScoreSignal 그대로 (kind, score, detail)
  blockReason: BlockReason;
  // 차단 사유 분석을 위한 raw fields (어드민 UI 가 활용)
  programRegion: string | null;
  programHouseholdTags: string[] | null;
  programBenefitTags: string[];
  // 본문 일부 (cohort 차단 사유 추적용 — false positive 의심 시 사장님이 직접 확인)
  // program.title + program.description 합친 haystack 에서 cohort 키워드 매칭 위치
  // 좌우 ~60자 발췌 (총 ~120자). cohort_mismatch 일 때만 채움, 그 외엔 null.
  excerptForCohort: string | null;
};

export function traceScore<T extends ScorableItem>(
  program: T,
  user: UserSignals,
  minScore: number,
): ScoreTrace;

export function summarizeTrace(traces: ScoreTrace[]): {
  total: number;
  shown: number;
  blocked: Record<BlockReason, number>;
  scoreDistribution: { bucket: string; count: number }[]; // [0, 1-3, 4-7, 8+]
};
```

`traceScore` 는 기존 `scoreProgram` 호출 + signals 분석으로 BlockReason 추론. score.ts 변경 X (read-only 진단).

### 3.5 화면 구성

```
┌─ 프로필 선택 ────────────────────────────────┐
│  [사장님 본인 ▼] [페르소나 1~6] [직접 입력]   │
│  현재 입력: 50대 / 전남 / 자영업자 / married │
└──────────────────────────────────────────────┘

┌─── 추천 정책 (welfare) — pool 100 ────────────┐
│  ✓ 노출 12 (12%)    ✗ 차단 88 (88%)          │
│                                                │
│  차단 사유:                                    │
│   ├ cohort_mismatch  47건  ⚠ false positive  │
│   │     의심? (정상 정책인데 본문 키워드     │
│   │     매칭으로 차단)                        │
│   ├ regional_gate    23건                     │
│   ├ household_gate   12건                     │
│   ├ below_min_score   6건                     │
│   └ no_signal         0건                     │
│                                                │
│  점수 분포 (0/1-3/4-7/8+): ████ ██ █ ████    │
│                                                │
│  ▼ 차단 정책 (사유별 fold)                    │
│   [cohort_mismatch]                           │
│   1. 청년 주거 지원 (서울)                    │
│      차단 본문 발췌: "...20대 청년..."        │
│      ⚠ 사장님은 50대 — false positive 의심   │
│   [regional_gate]                             │
│   1. 서울 자영업자 융자 (서울)                │
│      사장님 region (전남) ≠ 서울              │
│   ...                                          │
│                                                │
│  ▼ 노출 정책 (점수순)                         │
│   1. 전남 자영업자 융자 (점수 12)             │
│      signals: region+5, occupation+3,         │
│        business_match+5                       │
│   ...                                          │
└────────────────────────────────────────────────┘

[추천 대출] [정책 소식] [블로그 가이드] 동일 패턴
```

각 카드:
- 헤더: 영역명 + pool 크기 + 노출/차단 카운트
- 차단 사유별 막대 + 의심 마커 (cohort 가 가장 많으면 ⚠)
- 점수 분포 히스토그램 (4 bucket)
- 차단 정책 목록 (사유별 fold, 본문 발췌)
- 노출 정책 목록 (점수순, signals 표시)

### 3.6 데이터 흐름 (server component)

```ts
// app/admin/recommendation-trace/page.tsx (server)
const profile = await resolveProfile(searchParams.persona);
const [welfareTraces, loanTraces, newsTraces, blogTraces] = await Promise.all([
  traceArea("welfare", profile.signals),
  traceArea("loan", profile.signals),
  traceArea("news", profile.signals),
  traceArea("blog", profile.signals),
]);
return <TracePageView {...{ profile, welfareTraces, loanTraces, newsTraces, blogTraces }} />;
```

`traceArea` 는 영역별 pool fetch + 각 정책 traceScore 호출 + summarizeTrace 결과 반환.

영역별 pool query 는 기존 페이지 (`app/welfare/page.tsx` 등) 와 동일 SQL — 일관성 유지.

### 3.7 에러 처리

- 비로그인 → `/login?next=/admin/recommendation-trace`
- 비-admin → `/`
- 영역 pool fetch 실패 → 카드별 에러 메시지 (다른 영역 보존, `Promise.allSettled`)
- 페르소나 ID invalid → "사장님 본인" 으로 fallback
- 사장님 본인 페르소나 선택 시 onboarding 안 한 상태면 (`profile.isEmpty=true`) → "프로필 비어있음 — 페르소나 2-6 중 선택해주세요" 안내 + 빈 4 카드 렌더 안 함
- 페르소나 form submit → URL `?persona=N` 업데이트 → server component 가 `searchParams.persona` 로 분기

### 3.8 테스트 (`__tests__/personalization/diagnostic.test.ts`)

```ts
describe("traceScore — 차단 사유 분류", () => {
  it("정책 region=서울 + 사용자 region=전남 → regional_gate");
  it("정책 household_target=[single_parent] + 사용자=[married] → household_gate");
  it("정책 본문 '여성새로일하기' + 사용자 단순 신호 → cohort_mismatch");
  it("정책 본문 신호 없음 + 사용자 입력 0 → no_signal");
  it("정책 score 4점 + minScore 8 → below_min_score");
  it("정책 region+benefit 매칭 + score 12 → shown");
});

describe("summarizeTrace", () => {
  it("100건 입력 → blocked 카운트 합 + shown = total");
  it("점수 분포 4 bucket 합 = total");
});
```

LLM 호출 없음 / Supabase mock 없음 / pure function 테스트.

## 4. 영향 받는 파일

| 파일 | 변경 종류 | 라인 추정 |
|---|---|---|
| `app/admin/recommendation-trace/page.tsx` | 신규 | ~250 |
| `app/admin/recommendation-trace/personas.ts` | 신규 | ~80 |
| `app/admin/recommendation-trace/persona-form.tsx` | 신규 | ~120 |
| `lib/personalization/diagnostic.ts` | 신규 | ~150 |
| `__tests__/personalization/diagnostic.test.ts` | 신규 | ~80 |
| `lib/admin/menu.ts` | 수정 (~5줄) | 사이드 메뉴에 "추천 진단" 항목 추가 |

기존 score.ts / filter.ts / cohort 파일 변경 0. read-only 진단.

## 5. 안전 가드

| 위험 | 완화 |
|---|---|
| score.ts 회귀 위험 | 변경 0 — read-only |
| 사용자 노출 페이지 영향 | 어드민 전용 (`isAdminUser` 가드) |
| 본문 발췌 PII 노출 | 정책 본문은 이미 공개 데이터 (보도자료) — PII 없음 |
| 페르소나 정의 sync | `personas.ts` 1 곳 + `UserSignals` 타입 호환 (tsc 검증) |
| supabase 부하 | pool 100 × 4 영역 = 400 row 1 페이지 로드. SSR 1회만, 사장님 운영 도구라 부담 미미 |

## 6. 작업 단계 요약

1. `lib/personalization/diagnostic.ts` 신규 — `traceScore` + `summarizeTrace` + `BlockReason` 타입
2. `__tests__/personalization/diagnostic.test.ts` 신규 — 차단 사유 분류 8 케이스
3. `app/admin/recommendation-trace/personas.ts` 신규 — 6 페르소나 정의
4. `app/admin/recommendation-trace/persona-form.tsx` 신규 — 클라이언트 폼
5. `app/admin/recommendation-trace/page.tsx` 신규 — server component + 4 카드 렌더
6. `lib/admin/menu.ts` — 사이드 메뉴 항목 추가
7. `npm test` / `npm run lint` / `npx tsc --noEmit` 회귀 확인
8. code-reviewer subagent dispatch (push 전 필수)
9. 단일 commit + 사장님 push 승인

## 7. 다음 단계 (이 spec 의 산출물 활용)

이 페이지로 6 페르소나 × 4 영역 = 24 케이스 측정 결과를 기반으로:

- **옵션 D (snapshot framework)** — 24 케이스 baseline 으로 회귀 자동 감지 CI 구축
- **옵션 B (cohort gate 재설계)** — 측정된 false positive 패턴 우선순위 fix
- **(b)(c)(d) 후속** — household gate / minScore 캘리브레이션 / 데이터 백필 데이터 기반 결정

각 후속은 별도 brainstorming 세션에서 spec 작성.

## 8. 시간 추정

- 구현: **1.5-2일** (5 신규 파일 ~680줄 + 테스트 + 메뉴 수정)
- 진단 결과 분석: 0.5일 (페이지 띄우고 6 페르소나 × 4 영역 차단 패턴 검토)
- 후속 spec 결정: 1일 (분석 데이터 기반)

총 ~3일 후 옵션 D 또는 B 진입 가능.
