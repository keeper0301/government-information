# 추천 score 회귀 방지 snapshot 설계

작성일: 2026-05-06
컨텍스트: 옵션 D (architecture 재검토) 두 번째 spec. 첫 spec 인 진단 도구 (commit 766d99f) 와 함께 사용.

## 1. 배경

`lib/personalization/score.ts` 와 cohort gate 시스템에 최근 2주간 11+ commit fix 누적. 매번 cohort 추가 → 다른 영역 회귀 → 또 fix → 또 회귀 패턴.

진단 도구 (`/admin/recommendation-trace`) 가 prod 데이터 + 페르소나 측정은 가능하나, **자동 회귀 감지** 는 못 함. score.ts 변경 시 사장님이 수동으로 진단 페이지 클릭해서 비교해야 함.

이번 spec 은 **CI 자동 회귀 감지 framework** 구축. score.ts / cohort gate / regional gate 변경 시 fixture × 페르소나 매트릭스의 결과 분포가 baseline 과 다르면 `npm test` 가 fail.

### 옵션 B (cohort gate 재설계) 의 안전망

이번 framework 가 작동하면 옵션 B (cohort 재설계) 같은 큰 변경에서 의도되지 않은 회귀 즉시 감지. 옵션 D 가 옵션 B 의 *선행 작업* 인 이유.

## 2. 목표

- **score 로직 회귀 자동 감지**: score.ts / filter.ts / cohort 파일 변경 시 npm test 가 fail
- **데이터 변동 무관**: 정책 추가/삭제 (매일 cron) 와 무관한 baseline — fixture 사용
- **단순 + 표준**: vitest snapshot 그대로 사용. CI 통합 추가 작업 0
- **옵션 B 의 안전망**: 다음 spec (cohort gate 재설계) 진행 시 회귀 감지

### 비목표 (Out of Scope)

- prod 데이터 회귀 감지 (진단 도구가 그 역할 — 사장님 수동)
- score 로직 자체 변경 / 재설계 (옵션 B 의 별도 spec)
- snapshot diff 시각화 도구 (vitest 가 이미 충분히 표시)
- 페르소나 추가/수정 UI (`personas.ts` 가 source of truth)

## 3. 설계

### 3.1 아키텍처

```
[fixture 정책 ~18개]  ──×──  [페르소나 6개]
        ↓                          ↓
        traceScore() × 108 cases (개별 정책 차단 사유 분류)
        ↓
        페르소나별 summarizeTrace
        ↓
   vitest snapshot (자동 baseline)
        ↓
   npm test → snapshot mismatch → CI fail
```

추가로 **핵심 시나리오 hardcoded assertion** — snapshot 으로는 못 잡는 핵심 회귀 (예: 한부모 페르소나가 한부모 정책 차단 = 큰 사고) 를 명시 검증.

### 3.2 컴포넌트 (신규 2 파일 + 자동 생성 1)

| 파일 | 책임 | 라인 추정 |
|---|---|---|
| `__tests__/personalization/snapshot-fixtures.ts` | fixture 정책 ~18개 + 페르소나 import 재사용 | ~180 |
| `__tests__/personalization/snapshot.test.ts` | 매트릭스 trace + summary snapshot + 핵심 assertion | ~140 |
| `__tests__/personalization/__snapshots__/snapshot.test.ts.snap` (auto) | vitest -u 1회 생성된 baseline | ~200 (자동) |

페르소나 6개는 진단 도구의 `app/admin/recommendation-trace/personas.ts` 그대로 import (DRY). 사장님 본인 페르소나는 DB fetch 라 fixture 부적합 — 제외.

### 3.3 fixture 정책 종류 (~18개)

각 fixture 는 명확한 시나리오 + 주석 (어떤 페르소나에게 어떤 BlockReason 으로 차단/노출되어야 하는지).

| 카테고리 | 예시 정책 | 개수 |
|---|---|---|
| **광역별** (regional_gate 검증) | 서울/전남/경기/부산/충남 시도 정책 + 전국 1 | 6 |
| **cohort** (cohort_mismatch 검증) | 여성/청년/노인/다문화/보훈/아동 정책 | 6 |
| **household_target_tags 명시** (household_gate 검증) | 한부모/다자녀/장애가구 정책 | 3 |
| **income_target_level 명시** (income_gate 검증) | low / mid_low 대상 정책 | 2 |
| **일반** (강제 차단 신호 없음, score 매칭만 평가) | 카테고리 다양 | 1 |

총 18 개. fixture 의 정의 형식:
```ts
{
  id: "p_seoul_1",
  title: "서울 청년 주거 지원",
  description: "서울 거주 청년 대상 주거비 보조",
  region: "서울특별시",
  benefit_tags: ["주거"],
  // ... + 차단 사유 검증용 의도 주석
}
```

### 3.4 snapshot 단위

각 페르소나마다 **summary** snapshot:
```
페르소나 p2 (30대 서울 직장인 신혼):
  total: 18
  shown: 5
  blocked: { cohort_mismatch: 6, regional_gate: 4, household_gate: 2, ... }
  scoreDistribution: [{bucket: "0", count: 13}, {bucket: "1-3", count: 0}, ...]
```

개별 trace 의 score/signals 는 snapshot 하지 않음 — 너무 민감해서 무관 변경에도 false positive.

### 3.5 핵심 hardcoded assertion (snapshot 보강)

snapshot 분포만으로는 *어떤 정책이* shown/blocked 인지 명시 안 됨. 핵심 시나리오 5-6개:

```ts
// 페르소나 5 (한부모) → 한부모 정책 shown
expect(traceScore(fixtures.singleParentSupport, p5.signals, 8).blockReason)
  .toBe("shown");

// 페르소나 1 (사장님 안 됨, p2: 30대 서울) → 60대 정책 cohort_mismatch
expect(traceScore(fixtures.elderlySupport, p2.signals, 8).blockReason)
  .toBe("cohort_mismatch");

// 페르소나 6 (보훈) → 보훈 정책 shown
expect(traceScore(fixtures.veteranSupport, p6.signals, 8).blockReason)
  .toBe("shown");

// 페르소나 4 (대학생) → 다자녀 정책 household_gate
expect(traceScore(fixtures.multiChildSupport, p4.signals, 8).blockReason)
  .toBe("household_gate");

// 페르소나 5 (한부모) → 다른 광역 정책 regional_gate
expect(traceScore(fixtures.busanSupport, p5.signals, 8).blockReason)
  .toBe("regional_gate");
```

이 5-6개가 *큰 사고* 라인. snapshot 깨지면 사장님 확인 + assertion 깨지면 무조건 fix 필요.

### 3.6 baseline 갱신 방식

표준 vitest 흐름:

1. score.ts 의도적 변경 (예: cohort 추가)
2. `npm test -- snapshot` → mismatch 감지
3. diff 검토 — 의도된 변경인지 확인
4. 의도된 변경: `npm test -- snapshot -u` 로 baseline 갱신
5. 의도되지 않은 회귀: code fix → 다시 테스트

### 3.7 CI 통합

기존 `npm test` 가 이미 모든 테스트 자동 실행. snapshot 도 npm test 안에 포함 → 추가 작업 0.

### 3.8 에러 처리

snapshot framework 자체는 vitest 내장이라 에러 처리 외부에서 추가 0. fixture 가 score.ts 의 `ScorableItem` 타입 호환 — tsc 가 검증.

## 4. 영향 받는 파일

| 파일 | 변경 종류 | 라인 추정 |
|---|---|---|
| `__tests__/personalization/snapshot-fixtures.ts` | 신규 | ~180 |
| `__tests__/personalization/snapshot.test.ts` | 신규 | ~140 |
| `__tests__/personalization/__snapshots__/snapshot.test.ts.snap` | 신규 (자동 생성) | ~200 |

기존 score.ts / filter.ts / personas.ts 변경 0. read-only 검증.

## 5. 안전 가드

| 위험 | 완화 |
|---|---|
| score.ts 회귀 위험 | 변경 0 — read-only 검증만 |
| 사용자 노출 페이지 영향 | 테스트 파일만 — production 영향 0 |
| fixture 와 prod 데이터 괴리 | 의도된 분리 (목적이 score 로직 안정성) |
| baseline staleness | vitest -u 갱신 표준화 — diff 검토 후 commit |
| 의도된 변경에도 매번 fail | 핵심 assertion 5-6개만 + summary snapshot — 너무 민감하지 않게 |

## 6. 작업 단계 요약

1. `__tests__/personalization/snapshot-fixtures.ts` 신규 — 18 fixture 정의 (TypeScript ScorableItem 타입 호환)
2. `__tests__/personalization/snapshot.test.ts` 신규 — 매트릭스 trace + 페르소나별 summary snapshot + 핵심 assertion 5-6개
3. `npm test -- snapshot` 1회 실행 → baseline 자동 생성
4. baseline 검토 (diff 가 의도된 분포인지) → commit
5. `npm test` / `npm run lint` / `npx tsc --noEmit` 회귀
6. code-reviewer subagent dispatch (push 전 필수)
7. 단일 commit + 사장님 push 승인

## 7. 다음 단계 (이 spec 의 산출물 활용)

이 framework 가 활성화되면:

- **옵션 B (cohort gate 재설계)** — cohort 본문 정규식 → tag 기반 변경 시 회귀 즉시 감지. 6 페르소나 분포 baseline 깨지면 어디 영향인지 즉시 파악
- **future cohort 추가** — 새 cohort 정의 추가 시 다른 페르소나 회귀 없음 자동 검증
- **household gate 데이터 정합성** — household_target_tags 백필 시 페르소나 5/6 의 분포 변화 baseline 으로 추적

## 8. 시간 추정

- fixture 정의 1.5h + snapshot test 작성 1h + baseline 생성 0.1h + 회귀/리뷰/commit 0.5h
- **총 ~3 시간** (이전 spec 의 5-7일 추정 정정)
