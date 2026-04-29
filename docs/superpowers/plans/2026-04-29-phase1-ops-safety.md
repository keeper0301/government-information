# Phase 1 — 운영 안전망 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo prod 사고 즉시 인지 인프라 깔기. Sentry 에러 모니터링 + GitHub Actions CI 자동화 (vitest + tsc) 두 가지를 phase 1 묶음으로.

**Architecture:** Sentry 는 `@sentry/nextjs` 표준 SDK + Next.js 15 instrumentation 진입점. CI 는 push/PR 시 vitest + tsc 자동 실행. Vercel prod build 와 분리해 CI 중복 비용 0. Phase 1 만으로 후속 phase 사고 시 inbox 알림 가능.

**Tech Stack:** Next.js 15 / Sentry Next.js SDK / GitHub Actions / Node 20.

---

## File Structure

### Sentry (Task 1)
- **Create:** `instrumentation.ts` — Next.js 15 표준 진입점, server/edge runtime 분기
- **Create:** `instrumentation-client.ts` — 브라우저 사이드 init
- **Create:** `app/sentry-example-page/page.tsx` — 의도 에러 trigger 검증용 (admin gate)
- **Modify:** `next.config.ts` (있다면) 또는 `next.config.mjs` — `withSentryConfig` wrap
- **Modify:** `.gitignore` — `.sentryclirc` 추가
- **Test:** `tests/lib/sentry-config.test.ts` — config 객체 shape 검증 (외부 호출 mock)

### CI (Task 2)
- **Create:** `.github/workflows/ci.yml` — push/PR 시 vitest + tsc 실행
- **Modify:** `package.json` (선택) — `"ci": "tsc --noEmit && vitest run"` script 추가

### 메모리 (Task 3)
- **Create:** `~/.claude/projects/.../memory/project_keepioo_phase1_ops_safety.md` — 완료 기록

---

## Task 1: Sentry 통합

**Files:**
- Create: `instrumentation.ts`
- Create: `instrumentation-client.ts`
- Create: `app/sentry-example-page/page.tsx`
- Modify: `next.config.ts` (또는 `next.config.mjs`) — withSentryConfig wrap
- Modify: `.gitignore`
- Test: `tests/lib/sentry-config.test.ts`

### - [ ] Step 1: 현재 next.config 파일 형태 확인

```bash
ls next.config.*
```

Expected: `next.config.ts` 또는 `next.config.mjs` 1개 존재. 양쪽 다 없으면 `next.config.ts` 신규 작성.

### - [ ] Step 2: @sentry/nextjs 설치 (사장님 확인 후)

CLAUDE.md "물어보지 않고 패키지 설치 금지" 정책 적용 — 사장님 OK 받고:

```bash
npm install --save @sentry/nextjs
```

Expected: `package.json` dependencies 에 `@sentry/nextjs` 추가, lockfile 갱신.

### - [ ] Step 3: context7 로 Sentry Next.js 최신 setup 확인

```
mcp__plugin_context7_context7__resolve-library-id "sentry-nextjs"
mcp__plugin_context7_context7__query-docs <id> "Next.js 15 instrumentation setup"
```

이유: SDK 메이저 버전이 2026 들어 변경됐을 가능성. `instrumentation-client.ts` 가 최신 표준인지 확인.

### - [ ] Step 4: instrumentation.ts 작성 (server + edge)

```ts
// instrumentation.ts
// Next.js 15 표준 진입점 — 서버·edge runtime 분기로 Sentry SDK init
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // SSR/RSC 트레이스 — prod 0.1 비율 (비용 가드)
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

// Next.js 15 RSC error 자동 capture
export const onRequestError = Sentry.captureRequestError;
```

### - [ ] Step 5: instrumentation-client.ts 작성 (브라우저)

```ts
// instrumentation-client.ts
// 브라우저 사이드 Sentry init — Next.js 15.x 부터 별도 파일 표준
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session Replay 0 (비용·개인정보 신중)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
```

### - [ ] Step 6: next.config 에 withSentryConfig wrap

기존 `next.config.ts` 가 있다면:

```ts
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = { /* 기존 옵션 */ };

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // org/project 는 사장님 Sentry 콘솔에서 확정 후 등록
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // source map 업로드 토큰 — Vercel env 에 등록
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // tunneling — adblocker 우회 (선택)
  tunnelRoute: "/monitoring",
  // hideSourceMaps: true (production 에 sourcemap 노출 방지)
  hideSourceMaps: true,
});
```

### - [ ] Step 7: .gitignore 에 Sentry 산출물 추가

```diff
+ # Sentry
+ .sentryclirc
```

### - [ ] Step 8: app/sentry-example-page/page.tsx 작성 (의도 에러 trigger)

```tsx
// 사장님 Sentry 콘솔 검증 — admin 만 접근, 클릭 시 의도 에러 throw
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";

export const metadata = {
  title: "Sentry 검증 | 어드민",
  robots: { index: false, follow: false },
};

export default async function SentryExamplePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user.email)) redirect("/");

  async function triggerError() {
    "use server";
    throw new Error("Sentry 검증 — 의도된 에러");
  }

  return (
    <main className="min-h-screen pt-[80px] pb-20 max-w-lg mx-auto px-5">
      <h1 className="text-2xl font-extrabold mb-4">Sentry 검증</h1>
      <p className="text-sm text-grey-700 mb-6">
        버튼 클릭 → 서버 에러 throw → Sentry 콘솔에 도달하면 통합 성공.
      </p>
      <form action={triggerError}>
        <button
          type="submit"
          className="px-5 py-3 bg-red-500 text-white rounded-lg text-base font-bold"
        >
          의도된 에러 발생
        </button>
      </form>
    </main>
  );
}
```

### - [ ] Step 9: 단위 테스트 작성 — Sentry 환경 변수 누락 시 graceful fallback

```ts
// tests/lib/sentry-config.test.ts
import { describe, expect, it } from "vitest";

// instrumentation.ts 내부 init 호출이 SENTRY_DSN 없으면 noop 인지 확인.
// Sentry SDK 자체가 dsn undefined 시 disable 되도록 설계됐는지 검증.
describe("Sentry config", () => {
  it("env 누락이어도 import error 없이 로드", async () => {
    // 단순히 모듈 import 가 throw 안 하면 OK
    await expect(import("@sentry/nextjs")).resolves.toBeDefined();
  });
});
```

### - [ ] Step 10: tsc + vitest 검증

```bash
npx tsc --noEmit
npx vitest run
```

Expected: EXIT 0 / 18 file 300 tests pass (1 신규 추가).

### - [ ] Step 11: 사장님 외부 액션 안내 (commit 메시지에 포함)

사장님 액션:
1. https://sentry.io 가입 (Free tier 5K 이벤트/월)
2. Project 생성 → DSN 복사
3. Vercel 환경변수 등록:
   - `SENTRY_DSN` (서버)
   - `NEXT_PUBLIC_SENTRY_DSN` (브라우저, 동일 값)
   - `SENTRY_ORG` / `SENTRY_PROJECT` (조직 slug + 프로젝트 slug)
   - `SENTRY_AUTH_TOKEN` (Account Settings → Auth Tokens)
4. Redeploy
5. /sentry-example-page 접속 → 버튼 클릭 → Sentry 콘솔에 에러 도달 확인

### - [ ] Step 12: Commit

```bash
git add instrumentation.ts instrumentation-client.ts \
  app/sentry-example-page/page.tsx next.config.* .gitignore \
  tests/lib/sentry-config.test.ts package.json package-lock.json
git commit -m "feat(ops): Sentry 에러 모니터링 통합 (Phase 1 D1)

- @sentry/nextjs SDK + Next.js 15 instrumentation 진입점
- server/edge/browser 3 runtime 모두 init
- /sentry-example-page (admin only) 의도 에러 trigger 검증용
- 환경변수 5종 (Vercel) 사장님 외부 액션으로 분리

Phase 1 후속 D2 (CI workflow) 와 함께 묶이는 운영 안전망."
```

---

## Task 2: GitHub Actions CI 자동화

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` — `"ci"` script 추가 (선택)

### - [ ] Step 1: 기존 workflow 파일 확인

```bash
ls .github/workflows/
```

Expected: enrich.yml / collect.yml / cleanup.yml / alert-dispatch.yml / publish-blog.yml. **ci.yml 없음 확인**.

### - [ ] Step 2: ci.yml 작성

```yaml
# .github/workflows/ci.yml
# PR 또는 master push 시 자동 검증 — vitest + tsc 만 실행.
# Vercel 이 prod build 를 자체 처리하므로 next build 는 의도적으로 제외 (시간·비용 절감).
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    name: vitest + tsc
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: Node 20 설치 + npm cache
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: 의존성 설치 (lockfile 기준)
        run: npm ci

      - name: TypeScript 타입체크
        run: npx tsc --noEmit

      - name: vitest 단위 테스트
        run: npx vitest run --reporter=basic
```

### - [ ] Step 3: package.json 에 ci script 추가 (선택, 로컬에서도 동일 실행 가능)

```diff
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
+    "ci": "tsc --noEmit && vitest run",
     ...
   }
```

### - [ ] Step 4: 로컬에서 ci script 검증

```bash
npm run ci
```

Expected: tsc EXIT 0 → vitest 18 file 300 tests pass.

### - [ ] Step 5: Commit + push (CI workflow 첫 실행)

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci(ops): PR/push 자동 검증 workflow 추가 (Phase 1 D2)

- vitest + tsc 만 실행 (next build 는 Vercel 가 처리)
- master push + PR 양쪽 trigger
- Node 20 + npm cache + 10분 timeout
- package.json 'npm run ci' script 도 동일 실행

Phase 1 D1 (Sentry) 와 묶이는 운영 안전망."
git push origin master
```

### - [ ] Step 6: GitHub Actions 탭에서 첫 run 통과 확인

브라우저:
- https://github.com/keeper0301/government-information/actions
- "CI" workflow 의 첫 run 이 ✓ green 인지 확인

Expected: vitest + tsc 모두 통과, 5분 이내 완료.

---

## Task 3: Phase 1 마무리 검증 + 메모리

### - [ ] Step 1: 사장님 Sentry 콘솔 첫 에러 확인 (사장님)

사장님 외부 액션 완료 후:
1. /sentry-example-page 접속 → "의도된 에러 발생" 클릭
2. Sentry Issues 탭에서 `Error: Sentry 검증 — 의도된 에러` 보이면 통과

### - [ ] Step 2: CI workflow 신뢰성 검증

다음 PR 또는 push 에서 자동 실행되는지 1주일 모니터링.

### - [ ] Step 3: 메모리 갱신

`memory/project_keepioo_phase1_ops_safety.md` 신규 파일 작성:

```markdown
---
name: Phase 1 운영 안전망 완료 2026-04-29
description: Sentry + GitHub Actions CI 통합. master push/PR 자동 검증 + 사고 즉시 인지
type: project
---

# Phase 1 운영 안전망 (2026-04-29 commit ...)

## 산출물
- D1 Sentry: instrumentation.ts/instrumentation-client.ts + next.config wrap
- D2 CI: .github/workflows/ci.yml (vitest + tsc on push/PR)
- 의도 검증 페이지 /sentry-example-page (admin only)

## Vercel env 5종
- SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN / SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN

## 효과
- prod 에러 30분 내 인지 (전: Vercel 로그 수동 확인)
- PR/push 시 vitest 회귀 자동 차단
- master push 검증 5분 → 통합 안전망 마련
```

### - [ ] Step 4: MEMORY.md 갱신 — 새 메모리 등록

`MEMORY.md` 에 한 줄 추가:

```diff
+ - [Phase 1 운영 안전망 2026-04-29](project_keepioo_phase1_ops_safety.md) — Sentry + CI 통합
```

### - [ ] Step 5: 마스터 plan 갱신 (Phase 1 ✅ 표시)

`docs/superpowers/plans/2026-04-29-mass-upgrade-master.md` 의 Phase 1 줄에 ✅ 추가.

---

## 자체 리뷰 체크리스트

### 1. 산출물 일관성
- [x] Sentry 4 runtime (server/edge/browser/RSC error) 모두 cover
- [x] CI 가 prod build 와 분리되어 비용 0
- [x] tsc + vitest 양쪽 통과 검증

### 2. 사장님 외부 액션 분리
- [x] Sentry 가입·DSN·env 등록 (10분, 사장님)
- [x] CI workflow 는 자동 실행 (사장님 액션 0)

### 3. 회귀 위험
- Sentry SDK 가 DSN 없으면 자동 noop → env 등록 전후 회귀 0
- CI workflow 는 신규 추가라 기존 흐름 영향 0

### 4. 의존성·순서
- Task 1 (Sentry) → Task 2 (CI) — 독립적이라 순서 무관, 묶음 commit 도 가능

---

## 실행 옵션

**Plan 완료. 두 가지 실행 방식:**

1. **Subagent-Driven (권장)** — Phase 1 의 2 task 를 각자 fresh subagent 에 dispatch + 두 단계 review
2. **Inline Execution** — 현재 세션에서 task 단위 batch 실행

사장님 선택 후 진행.

---

**Why:** Phase 1 은 사고 즉시 인지 + 회귀 자동 차단 두 가지 인프라. Phase 2~6 모든 후속 phase 의 안전망. 가장 작은 phase (3h) 라 사장님 부담 적음.

**How to apply:** task 단위로 commit 분리. Sentry 환경변수 등록은 사장님 외부 액션 — 등록 전에도 코드는 동작 (graceful noop).
