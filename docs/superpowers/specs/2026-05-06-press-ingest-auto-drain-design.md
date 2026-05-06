# 광역 보도자료 후보 적체 자동 해소 설계

작성일: 2026-05-06
연관 이전 작업: `2026-04-29-regional-press-auto-ingest.md` (cron 1회·cap 30 도입)

## 1. 배경

`/admin` 메인 대시보드 "지금 처리 필요" 영역에 다음 알림이 뜨고 있음:

> ⚠ 광역 보도자료 후보 적체 **54** →

이 알림은 `lib/admin/dashboard-alerts.ts` 에서 다음 조건일 때 노출된다:

```ts
const PRESS_INGEST_BACKLOG_THRESHOLD = 30;
if (kpi.candidates_24h >= PRESS_INGEST_BACKLOG_THRESHOLD) { /* alert */ }
```

즉 광역도청 보도자료 L1 후보 (24h 누적, LLM 분류 전) 가 30건 이상이면 적체로 판정한다.

### 적체 원인

현재 자동 분류 cron 은 매일 1회 (`vercel.json` 의 `30 16 * * *` UTC = KST 01:30) 만 실행되고 후보를 30건만 처리하도록 cap 이 걸려있다 (`lib/press-ingest/ingest.ts` 의 `CANDIDATE_LIMIT = 30`).

광역 17개 도청이 평일 업무시간에 발행하는 보도자료가 30건 + 키워드 매칭률을 합산하면 일일 30건 초과가 일상이며, 초과분은 다음 cron 까지 적체된다.

### 추가 비효율: cron 시간이 한국 발행 패턴과 안 맞음

KST 01:30 cron 은 광역도청 발행이 거의 없는 새벽이다. 이 시점에 회수해도 회수할 게 적고, 정작 평일 업무시간 (KST 09–18) 에 쏟아지는 발행이 다음 새벽까지 24시간 가까이 분류 대기 상태로 남는다.

## 2. 목표

1. **L1 적체 자동 해소**: 후보가 쌓여 있는 상태가 지속되지 않도록 자동 처리.
2. **한국 발행 패턴에 맞춘 cron 배치**: 평일 업무시간 발행을 그날 안에 회수.
3. **L2 confirm 단계는 그대로 수동 유지**: 사장님 최종 검토 가드 보존 (사용자 노출 위험 0).
4. **운영 안전망 보존**: dashboard 알림 임계값은 그대로 두어 자동화도 못 따라잡으면 사장님께 신호.

### 비목표 (Out of Scope)

- L2 confirm 자동 승인 (별도 결정 필요. 본 작업은 안전 우선이라 제외).
- 후보 fetch 로직 (L1 키워드 매칭) 변경.
- LLM 모델 변경.
- press_ingest_candidates 테이블 스키마 변경.

## 3. 설계

### 3.1 cron 빈도 ↑ — 매일 1회 → 매일 3회

`vercel.json` 의 press-ingest cron 1줄을 3줄로 분리한다. UTC 기준이지만 의도는 한국시간 업무시간 직후이다.

| KST | UTC | 의미 |
|---|---|---|
| 10:30 | 01:30 | 오전 발표 (보통 10시 전후) 직후 회수 |
| 15:30 | 06:30 | 오후 발표 직후 회수 |
| 19:30 | 10:30 | 업무 마감 후 마지막 정산 |

```json
// vercel.json — 변경 전
{ "path": "/api/cron/press-ingest", "schedule": "30 16 * * *" },

// vercel.json — 변경 후
{ "path": "/api/cron/press-ingest", "schedule": "30 1 * * *" },
{ "path": "/api/cron/press-ingest", "schedule": "30 6 * * *" },
{ "path": "/api/cron/press-ingest", "schedule": "30 10 * * *" }
```

주말 발행은 거의 없지만 cron 은 매일 실행한다. 비용 0, 위험 0이라 평일 제한은 over-engineering.

### 3.2 cap 동적 상향 — 적체 감지 시 30 → 50

`lib/press-ingest/ingest.ts` 의 `runAutoIngest()` 가 후보 수를 보고 cap 을 결정한다.

```
BASE_CAP = 30
BOOSTED_CAP = 50

후보 fetch (24h, max 200건 — cap 결정용)
  ├ 후보 수 ≤ BASE_CAP → cap = BASE_CAP (평소)
  └ 후보 수 > BASE_CAP → cap = BOOSTED_CAP (적체 감지)

cap 만큼만 LLM 분류 → press_ingest_candidates 저장
```

#### 왜 50 이고 60 이 아닌가 — timeout 안전 margin

- `maxDuration = 300` (5분)
- LLM 호출 worst case 5초/건 가정
- cap 50 × 5초 = 250초 → 50초 안전 margin
- cap 60 × 5초 = 300초 → margin 0, timeout 위험

#### Capacity 산수

| 상황 | 일일 capacity |
|---|---|
| 평소 (cap 30) | 3회 × 30 = **90건/일** |
| 적체 (cap 50) | 3회 × 50 = **150건/일** |

광역도청 평균 발행 30건/일 이하라면 평소 cap 30 만으로 적체가 발생하지 않으며, spike (50–100건/일) 발생 시에도 적체 감지 → cap 50 으로 1일 안에 해소된다.

### 3.3 Dashboard 알림은 그대로

`lib/admin/dashboard-alerts.ts` 의 `PRESS_INGEST_BACKLOG_THRESHOLD = 30` 은 그대로 둔다.

이유: 자동화 후 평소엔 거의 알림이 뜨지 않지만, 만약 후보가 50+ 인 상태로 24h 유지된다면 그건 자동화도 못 따라잡는 사고 신호 (예: ANTHROPIC_API_KEY 만료, vercel cron 장애, Anthropic API 다운). 사장님이 인지할 수 있도록 안전망 유지.

## 4. 영향 받는 파일

| 파일 | 변경 내용 | 라인 추정 |
|---|---|---|
| `vercel.json` | cron 1줄 → 3줄 | +2 |
| `lib/press-ingest/ingest.ts` | `CANDIDATE_LIMIT` 상수를 동적 함수로 교체 | +10 |
| `__tests__/lib/press-ingest-ingest.test.ts` (신규) | 동적 cap 단위 테스트 | +60 |

기존 `__tests__/lib/press-ingest-candidates.test.ts` 는 회귀 보존만 확인.

## 5. 구현 상세

### 5.1 `lib/press-ingest/ingest.ts` 변경

```ts
// 변경 전
const CANDIDATE_LIMIT = 30;
// ...
const candidates = await getPressIngestCandidates(24, CANDIDATE_LIMIT);

// 변경 후
const BASE_CAP = 30;        // 평소 처리 cap
const BOOSTED_CAP = 50;     // 적체 감지 시 cap (timeout 안전 margin 50초 확보)
const PROBE_LIMIT = 200;    // cap 결정용 후보 카운트 limit

// ...
// 1) 후보 fetch — cap 결정용으로 PROBE_LIMIT 까지 가져옴
const probed = await getPressIngestCandidates(24, PROBE_LIMIT);
// 2) cap 결정 — 후보 수가 BASE_CAP 초과면 BOOSTED_CAP 으로 상향
const cap = probed.length > BASE_CAP ? BOOSTED_CAP : BASE_CAP;
const candidates = probed.slice(0, cap);
result.candidates = candidates.length;
```

`getPressIngestCandidates(24, 200)` 호출은 Supabase select 1회로 200 row fetch — 비용 거의 동일 (postgres index scan).

### 5.2 단위 테스트 (`__tests__/lib/press-ingest-ingest.test.ts`)

```ts
describe("runAutoIngest 동적 cap", () => {
  it("후보 ≤ 30 → cap 30, 후보 수 그대로 처리");
  it("후보 31~49 → cap 50, 후보 수 그대로 처리");
  it("후보 ≥ 50 → cap 50, 50건만 처리 (limit)");
  it("LLM 분류 실패 시 failed 큐에 저장 (회귀)");
});
```

LLM 호출은 mock (`vi.mock` 으로 `classifyPressNews` stub).
Supabase admin client 도 mock (`@/lib/supabase/admin`) — 실제 DB 호출 금지.

### 5.3 호환성

- L1 후보 fetch 함수 (`getPressIngestCandidates`) 변경 없음 → 다른 호출자 (`/admin/press-ingest` 페이지) 영향 없음.
- press_ingest_candidates 테이블 스키마 변경 없음.
- Anthropic rate limit: cron 최소 4시간 간격 + LLM 순차 호출 → 안전.

## 6. 안전 가드

| 위험 | 완화 |
|---|---|
| timeout (300s 초과) | cap 50 + 안전 margin 50초 |
| Anthropic rate limit | cron 최소 4시간 간격 (KST 10:30 / 15:30 / 19:30) + 순차 호출 (현재 구현 그대로) |
| L2 자동 등록 위험 | confirm 단계 수동 유지 — 본 작업 범위 X |
| 자동화 실패 신호 | dashboard 알림 임계값 30 그대로 — 사장님 인지 가능 |
| 무한 반복 LLM 호출 | existing news_id skip + failed 큐 기록 (현재 구현 그대로) |

## 7. 회수 시간 (실측 추정)

현재 알림 54건 적체 → 다음 cron (KST 10:30 또는 15:30 또는 19:30) 실행 시:
- 후보 54건 > BASE_CAP 30 → cap 50 으로 상향
- 50건 처리 → L2 큐에 50건 등재
- 남은 4건은 다음 cron (4–15시간 후) 에서 자동 처리

**최대 약 15시간 (다음 KST 10:30 cron) 안에 적체 알림 사라짐. 보통 4–5시간 안에 해소.**

## 8. 비용 영향

LLM 1건당 ~$0.003 (Haiku 4.5).

| 시나리오 | 일일 비용 |
|---|---|
| 평소 (발행 30건) | $0.09/일 (변동 없음) |
| 발행 spike + 적체 해소일 | $0.15/일 (+$0.06) |
| 월 평균 | ~$3/월 (큰 변동 없음) |

## 9. 작업 단계 요약

1. `vercel.json` 의 press-ingest cron 1줄을 3줄로 분리.
2. `lib/press-ingest/ingest.ts` 에 동적 cap 로직 추가.
3. `__tests__/lib/press-ingest-ingest.test.ts` 신규 작성 — 동적 cap 케이스 4개.
4. `npm test` 통과 확인.
5. `npm run build` 또는 `npm run lint` 회귀 확인.
6. 사장님 변경사항 미리보기 → 승인 → 단일 커밋 (한국어, `feat(press-ingest): ...`) → push.
7. Vercel 배포 후 첫 cron (KST 10:30 또는 15:30 또는 19:30) 실행 시 알림 감소 확인.
