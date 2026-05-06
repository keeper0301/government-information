# 광역 보도자료 후보 적체 자동 해소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광역 보도자료 L1 후보 적체 (현재 54건) 를 cron 빈도 ↑ + 동적 cap 상향으로 자동 해소한다. L2 confirm 수동 단계는 그대로 보존한다.

**Architecture:** `vercel.json` 의 press-ingest cron 1줄을 3줄 (KST 10:30 / 15:30 / 19:30) 로 분리하고, `lib/press-ingest/ingest.ts` 의 `runAutoIngest()` 가 `decideCap(probedCount)` pure function 으로 cap 을 30 (평소) 또는 50 (적체 감지) 으로 동적 결정한다.

**Tech Stack:** Next.js 16 / TypeScript / vitest / Vercel cron

연관 spec: `docs/superpowers/specs/2026-05-06-press-ingest-auto-drain-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `__tests__/lib/press-ingest-ingest.test.ts` | 신규 | `decideCap` pure function 단위 테스트 (mock 0개) |
| `lib/press-ingest/ingest.ts` | 수정 | `BASE_CAP` / `BOOSTED_CAP` / `PROBE_LIMIT` 상수 + `decideCap` export + `runAutoIngest` 에서 사용 |
| `vercel.json` | 수정 | press-ingest cron schedule 1줄 → 3줄 분리 |

설계 원칙:
- cap 결정 로직을 pure function (`decideCap`) 으로 분리 → mock 없이 단위 테스트 가능
- 기존 `runAutoIngest()` 의 sequential LLM 호출 / existing skip / failed 큐 동작은 그대로 보존
- 다른 호출자 (`/admin/press-ingest` 페이지) 영향 없음 (`getPressIngestCandidates` 함수 시그니처 변경 X)

---

## Task 1: `decideCap` pure function 단위 테스트 작성 (TDD red)

**Files:**
- Create: `__tests__/lib/press-ingest-ingest.test.ts`

- [ ] **Step 1: 테스트 파일 생성**

`__tests__/lib/press-ingest-ingest.test.ts` 파일을 다음 내용으로 새로 만든다:

```ts
import { describe, expect, it } from "vitest";
import { BASE_CAP, BOOSTED_CAP, decideCap } from "@/lib/press-ingest/ingest";

describe("decideCap — 광역 보도자료 후보 동적 cap", () => {
  it("후보 0건 → BASE_CAP (30, 평소)", () => {
    expect(decideCap(0)).toBe(BASE_CAP);
    expect(BASE_CAP).toBe(30);
  });

  it("후보 30건 (경계) → BASE_CAP — cap 동일", () => {
    expect(decideCap(30)).toBe(BASE_CAP);
  });

  it("후보 31건 (적체 시작) → BOOSTED_CAP (50)", () => {
    expect(decideCap(31)).toBe(BOOSTED_CAP);
    expect(BOOSTED_CAP).toBe(50);
  });

  it("후보 200건 (probe 한계) → BOOSTED_CAP", () => {
    expect(decideCap(200)).toBe(BOOSTED_CAP);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인 (TDD red)**

Run: `npm test -- press-ingest-ingest`

Expected: 4 tests FAIL with "Cannot find name 'decideCap'" 또는 import error (`decideCap`/`BASE_CAP`/`BOOSTED_CAP` 가 아직 export 안 됨).

---

## Task 2: `lib/press-ingest/ingest.ts` 에 동적 cap 로직 추가 (TDD green)

**Files:**
- Modify: `lib/press-ingest/ingest.ts`

- [ ] **Step 1: 기존 `CANDIDATE_LIMIT` 상수 + 한 줄 주석 제거**

`lib/press-ingest/ingest.ts:27` 의 다음 줄 (한 줄):

```ts
const CANDIDATE_LIMIT = 30; // 24h 후보 cap (LLM 비용 통제)
```

를 다음으로 교체한다:

```ts
// 광역 보도자료 후보 cap — 적체 감지 시 동적 상향
// BASE_CAP × cron 3회/일 = 90건/일 capacity
// BOOSTED_CAP × 3회 = 150건/일 capacity (적체 spike 흡수)
// timeout margin: BOOSTED_CAP × 5초 = 250초 < maxDuration 300초
export const BASE_CAP = 30;
export const BOOSTED_CAP = 50;
const PROBE_LIMIT = 200; // cap 결정용 probe limit (실제 처리는 cap 만큼만)

/**
 * 후보 수에 따라 처리 cap 을 결정.
 * pure function — decideCap(N) 만 단위 테스트.
 */
export function decideCap(probedCount: number): number {
  return probedCount > BASE_CAP ? BOOSTED_CAP : BASE_CAP;
}
```

- [ ] **Step 2: `runAutoIngest()` 내부 후보 fetch 부분 교체**

`lib/press-ingest/ingest.ts:53-55` (3줄):

```ts
  // 1) 24h 후보 fetch (cap)
  const candidates = await getPressIngestCandidates(24, CANDIDATE_LIMIT);
  result.candidates = candidates.length;
```

를 다음으로 교체한다:

```ts
  // 1) 24h 후보 fetch — PROBE_LIMIT 까지 (cap 결정용)
  // 후보 수가 BASE_CAP 초과면 BOOSTED_CAP 으로 동적 상향
  const probed = await getPressIngestCandidates(24, PROBE_LIMIT);
  const cap = decideCap(probed.length);
  const candidates = probed.slice(0, cap);
  result.candidates = candidates.length;
```

- [ ] **Step 3: 테스트 실행해서 통과 확인 (TDD green)**

Run: `npm test -- press-ingest-ingest`

Expected: 4 tests PASS.

- [ ] **Step 4: 전체 테스트 회귀 확인 (기존 press-ingest 테스트 보존)**

Run: `npm test -- press-ingest`

Expected: press-ingest 관련 모든 테스트 PASS (`press-ingest-candidates.test.ts` 의 4개 + 신규 4개 = 8/8).

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`

Expected: type error 없음. (만약 `CANDIDATE_LIMIT` 다른 곳에서 import 되어 있으면 여기서 잡힘 — 그 경우는 `BASE_CAP` 으로 교체)

---

## Task 3: `vercel.json` cron schedule 1줄 → 3줄로 분리

**Files:**
- Modify: `vercel.json:48`

- [ ] **Step 1: cron schedule 교체**

`vercel.json:48` 의 다음 한 줄:

```json
    { "path": "/api/cron/press-ingest", "schedule": "30 16 * * *" },
```

를 다음 3줄로 교체한다:

```json
    { "path": "/api/cron/press-ingest", "schedule": "30 1 * * *" },
    { "path": "/api/cron/press-ingest", "schedule": "30 6 * * *" },
    { "path": "/api/cron/press-ingest", "schedule": "30 10 * * *" },
```

UTC 기준이며 KST 환산:
- `30 1 * * *` UTC = KST **10:30** (오전 발표 직후)
- `30 6 * * *` UTC = KST **15:30** (오후 발표 직후)
- `30 10 * * *` UTC = KST **19:30** (업무 마감 후 정산)

- [ ] **Step 2: JSON 유효성 검증**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8')); console.log('OK')"`

Expected: stdout `OK` 출력. (JSON 파싱 에러 시 syntax error 메시지 출력 + non-zero exit)

- [ ] **Step 3: cron 개수 확인**

Run: `node -e "const v=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); const press=v.crons.filter(c=>c.path==='/api/cron/press-ingest'); console.log('press-ingest cron 개수:', press.length); press.forEach(c=>console.log(' -', c.schedule));"`

Expected:
```
press-ingest cron 개수: 3
 - 30 1 * * *
 - 30 6 * * *
 - 30 10 * * *
```

---

## Task 4: 최종 회귀 확인

**Files:** (변경 없음 — 전체 검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm test`

Expected: 모든 테스트 PASS (기존 + 신규 4건 추가). Failure 발생 시 무관 영역이라도 확인 후 결정 (이 plan 의 변경이 깬 게 아니라면 그대로 진행).

- [ ] **Step 2: lint 통과 확인**

Run: `npm run lint`

Expected: 신규/변경 파일에 lint error 없음. 기존 무관 warning 은 그대로 둠.

- [ ] **Step 3: typecheck (안전 확인)**

Run: `npx tsc --noEmit`

Expected: type error 없음.

---

## Task 5: 코드 리뷰 subagent dispatch (push 전 필수)

사장님 메모리 규칙: "모든 작업 완료 후 code reviewer subagent dispatch 필수. 자체 review 만으로 push 금지."

- [ ] **Step 1: 변경사항 diff 추출**

Run: `git diff --stat vercel.json lib/press-ingest/ingest.ts; git status __tests__/lib/press-ingest-ingest.test.ts`

Expected: 3 파일 변경 표시 (1 신규 + 2 수정).

- [ ] **Step 2: superpowers:code-reviewer subagent dispatch**

Agent 도구로 `superpowers:code-reviewer` 를 호출한다. 프롬프트에 다음을 포함:
- Plan 경로: `docs/superpowers/plans/2026-05-06-press-ingest-auto-drain.md`
- Spec 경로: `docs/superpowers/specs/2026-05-06-press-ingest-auto-drain-design.md`
- 변경 파일 3개 (위)
- 점검 포인트:
  1. `decideCap` 경계 조건 (30 / 31)
  2. `runAutoIngest` 의 기존 동작 (existing skip / failed 큐) 보존 여부
  3. cron schedule UTC↔KST 환산 정확성
  4. timeout margin 충분 여부 (cap 50 × 5s = 250s < 300s)
  5. 다른 호출자 (`/admin/press-ingest` 페이지) 영향

- [ ] **Step 3: 리뷰 결과 반영**

리뷰가 fix 요청을 내면 별도 commit 으로 반영한 뒤 다시 review (단, 사장님이 "그대로 가도 됨" 결정 시 skip 가능).

---

## Task 6: 단일 커밋 + 사장님 push 승인

- [ ] **Step 1: 사장님께 변경사항 미리보기**

Run: `git status -- vercel.json lib/press-ingest/ingest.ts __tests__/lib/press-ingest-ingest.test.ts; git diff -- vercel.json lib/press-ingest/ingest.ts`

(신규 파일 `__tests__/lib/press-ingest-ingest.test.ts` 는 `git diff` 로 안 보이므로 `git diff --cached` 또는 `cat` 으로 별도 노출)

사장님께 변경사항 요약 출력. 이미 working tree 에 있던 `__tests__/personalization/score.test.ts` / `lib/personalization/score.ts` 변경은 **이번 commit 에 포함 X** — 사장님 별도 결정.

- [ ] **Step 2: 본 작업 3 파일만 stage + 단일 commit**

Run:
```bash
git add vercel.json lib/press-ingest/ingest.ts __tests__/lib/press-ingest-ingest.test.ts
git commit -m "$(cat <<'EOF'
feat(press-ingest): 광역 보도자료 후보 적체 자동 해소

- vercel.json: cron 매일 1회 → 3회 (KST 10:30 / 15:30 / 19:30) 한국 발행 패턴 정렬
- lib/press-ingest/ingest.ts: decideCap pure function 으로 적체 감지 시 cap 30 → 50 동적 상향
- __tests__/lib/press-ingest-ingest.test.ts: decideCap 경계 4 케이스 단위 테스트
- L2 confirm 수동 단계 + 알림 임계값 30 그대로 (안전 가드 유지)

연관: docs/superpowers/specs/2026-05-06-press-ingest-auto-drain-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit 성공. (pre-commit hook 실패 시 에러 원인 확인 후 fix → **새 commit** — `--amend` 금지)

- [ ] **Step 3: 사장님 명시 push 승인 받기**

사장님께 "master 에 push 해도 될까요?" 질문. **명시 승인 (예: "푸시해줘", "ok push")** 받기 전엔 push 금지.

- [ ] **Step 4: master 에 push (승인 후)**

Run: `git push origin master`

Expected: push 성공. Vercel 자동 배포 trigger.

- [ ] **Step 5: Vercel 배포 + 알림 감소 확인 안내**

사장님께 다음 안내:
- 배포 완료 후 첫 cron 실행 시점 (KST 10:30 또는 15:30 또는 19:30 중 가장 가까운 시각) 안내
- 그 시점 이후 `/admin` 메인의 "광역 보도자료 후보 적체" 알림 수치가 줄어드는지 확인 요청
- 8시간 이내 적체 알림이 사라지지 않으면 사고 신호 — `/admin/cron-trigger` 또는 Vercel 로그 확인 필요

---

## Self-Review (작성자 inline 점검)

**1. Spec 커버리지**

| Spec 섹션 | 구현 task |
|---|---|
| 3.1 cron 빈도 ↑ (3회) | Task 3 |
| 3.2 cap 동적 상향 (30→50) | Task 1, 2 |
| 3.3 Dashboard 알림 그대로 | (변경 없음 — 그대로 둠. plan 에 명시) |
| 5.1 ingest.ts 변경 | Task 2 |
| 5.2 단위 테스트 | Task 1 |
| 6 안전 가드 | Task 5 (code review) + Task 6 (사장님 승인) |

**2. Placeholder 스캔**: TBD/TODO/"적절한 처리" 같은 placeholder 없음. 모든 코드 블록 실제 코드. 모든 명령어 실제 실행 가능.

**3. Type 일관성**: `BASE_CAP` / `BOOSTED_CAP` / `decideCap` / `PROBE_LIMIT` — Task 1, 2 에서 동일 이름 사용. import 경로 `@/lib/press-ingest/ingest` 일관.

**4. 무관 변경사항 처리**: 워킹 트리에 있던 `__tests__/personalization/score.test.ts` / `lib/personalization/score.ts` 는 Task 6 Step 2 에서 명시적으로 stage 제외. 본 작업과 무관하므로 사장님 별도 결정.
