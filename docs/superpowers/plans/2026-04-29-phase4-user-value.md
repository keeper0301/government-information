# Phase 4 — 사용자 가치 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 트래픽이 SEO/SEO 진입로 (Phase 2) + 콘텐츠 품질 (Phase 3) 로 들어왔을 때 **재방문 trigger** 와 **모바일 retention** 강화.

**Architecture:**
- C2 = 마이페이지 보강 (DDL 0). 알림 history UI 강화 + 즐겨찾기 정렬·필터.
- C1 = /compare 확장. bookmarks → "선택 비교" 진입 강화 + /compare 의 "내 즐겨찾기 자동 추천" 섹션.
- C3 = PWA service worker. `public/sw.js` (Next.js next-pwa 또는 직접) + offline 페이지 + push subscribe 1단계 (발송 X).

**Tech Stack:** Next.js 15 / Supabase / 기존 user_wishes·alert_deliveries 테이블 / Web Push API / Service Worker.

---

## File Structure

### C2 — 마이페이지 보강 (2h)
- **Modify:** `app/mypage/notifications/history/page.tsx` — 알림 발송 history UI 강화 (필터·검색·페이지네이션)
- **Modify:** `app/mypage/bookmarks/page.tsx` — 정렬·필터 (최근 추가·마감 임박·카테고리)
- **Test:** `__tests__/lib/mypage/bookmark-sort.test.ts` — 정렬 로직 단위 테스트

### C1 — /compare 확장 (2h)
- **Modify:** `app/compare/page.tsx` — "내 즐겨찾기 자동 추천" 섹션 (로그인 사용자 한정)
- **Modify:** `app/mypage/bookmarks/compare-form.tsx` — "선택 비교" UX 강화 (선택 카운트·상한 안내)
- **Create:** `lib/compare-suggestions.ts` — 즐겨찾기 ↔ 동일 카테고리 자동 매칭
- **Test:** `__tests__/lib/compare-suggestions.test.ts`

### C3 — PWA service worker (3h)
- **Create:** `public/sw.js` — service worker (캐싱 + push 이벤트 listener)
- **Create:** `app/offline/page.tsx` — offline fallback 페이지
- **Create:** `components/pwa-register.tsx` — sw 등록 + push subscribe (client component)
- **Modify:** `app/layout.tsx` — PWARegister 마운트
- **Modify:** `app/manifest.ts` — start_url shortcuts 추가 (선택)
- **Test:** `__tests__/components/pwa-register.test.ts` — 가벼운 sw 등록 플로우

---

## Task 1: C2 마이페이지 보강 (8 step)

**Files:**
- Modify: `app/mypage/notifications/history/page.tsx`, `app/mypage/bookmarks/page.tsx`
- Test: `__tests__/lib/mypage/bookmark-sort.test.ts`

### - [ ] Step 1: 기존 두 페이지 코드 읽기

`app/mypage/notifications/history/page.tsx` + `app/mypage/bookmarks/page.tsx` Read 후 현재 구조 파악. 추가할 영역 식별.

### - [ ] Step 2: 알림 history 강화

`history/page.tsx` 에 다음 추가:
- URL query 기반 필터 (`?status=sent|failed`, `?period=7d|30d|all`, `?q=...` 정책 검색)
- 페이지네이션 (`?page=N`, 30건/페이지) — `app/admin/my-actions` 패턴 답습
- 빈 상태 안내 ("최근 알림이 없어요" + 알림 규칙 추가 link)
- 발송 상태별 배지 색상 (success: emerald / failed: red / pending: amber)

### - [ ] Step 3: 즐겨찾기 정렬·필터 강화

`bookmarks/page.tsx` 에 다음 추가:
- 정렬: `?sort=recent|deadline|title` (default: recent)
- 필터: `?type=welfare|loan|all` (default: all), `?cat=...` 카테고리 chip
- 빈 상태 안내 ("아직 즐겨찾기가 없어요" + 추천 페이지 link)

### - [ ] Step 4: 정렬 로직 분리

`lib/mypage/bookmark-sort.ts` 신규 — pure function:
```ts
export type SortMode = "recent" | "deadline" | "title";
export function sortBookmarks(items: BookmarkItem[], mode: SortMode): BookmarkItem[] { ... }
```

### - [ ] Step 5: 단위 테스트 (5 case)
- recent (created_at desc)
- deadline (apply_end asc, null last)
- title (가나다)
- 빈 배열
- 같은 timestamp 핸들링 (안정 정렬)

### - [ ] Step 6: tsc + vitest 검증

```bash
npm run ci
```

### - [ ] Step 7: Commit (push 안 함)

```bash
git add app/mypage/notifications/history/page.tsx \
  app/mypage/bookmarks/page.tsx \
  lib/mypage/bookmark-sort.ts \
  __tests__/lib/mypage/bookmark-sort.test.ts
git commit -m "feat(mypage): 알림 history 필터·페이지네이션 + 즐겨찾기 정렬·필터 (Phase 4 C2)
..."
```

### - [ ] Step 8: spec + code quality reviewer dispatch

---

## Task 2: C1 /compare 확장 (8 step)

**Files:**
- Create: `lib/compare-suggestions.ts`
- Modify: `app/compare/page.tsx`, `app/mypage/bookmarks/compare-form.tsx`
- Test: `__tests__/lib/compare-suggestions.test.ts`

### - [ ] Step 1: lib/compare-suggestions.ts 작성

```ts
// lib/compare-suggestions.ts
// /compare 에 진입한 사용자에게 즐겨찾기 기반 자동 비교 후보 추천.
// 같은 카테고리 (welfare/loan) 내 즐겨찾기 정책 중 2~3개 자동 페어 제안.

export interface SuggestPair {
  type: "welfare" | "loan";
  ids: string[]; // 2~3개
  reason: string; // "내 즐겨찾기 청년 카테고리 3건"
}

export function buildSuggestions(
  bookmarks: Array<{ id: string; type: "welfare" | "loan"; category: string | null }>,
): SuggestPair[] { ... }
```

매칭 로직:
- 같은 type 내 같은 category 가 ≥ 2건이면 1 페어
- 페어당 최대 3건
- 페어 ≥ 2개면 사용자에게 노출

### - [ ] Step 2: 단위 테스트 (4 case)
- 빈 즐겨찾기
- 단일 카테고리 ≥ 2건
- 다중 카테고리
- 같은 type 다른 카테고리 혼합

### - [ ] Step 3: app/compare/page.tsx 에 "내 즐겨찾기 추천" 섹션 추가

로그인 사용자 한정. type/ids 쿼리 없이 진입 시 (즉 빈 /compare 진입) buildSuggestions 결과 카드 표시. 클릭 → /compare?type=...&ids=... 자동 채움.

### - [ ] Step 4: app/mypage/bookmarks/compare-form.tsx 강화

- 선택 카운트 표시 ("3개 선택됨, 최대 3개")
- 같은 type 만 비교 가능 (welfare 와 loan 섞으면 disabled)
- "비교하기" 버튼 활성 조건 명시

### - [ ] Step 5: tsc + vitest 검증

### - [ ] Step 6: 로컬 dev server 또는 build 검증 (선택)

### - [ ] Step 7: Commit (push 안 함)

```bash
git add lib/compare-suggestions.ts \
  app/compare/page.tsx \
  app/mypage/bookmarks/compare-form.tsx \
  __tests__/lib/compare-suggestions.test.ts
git commit -m "feat(compare): 즐겨찾기 기반 자동 비교 추천 + 선택 UX 강화 (Phase 4 C1)
..."
```

### - [ ] Step 8: spec + code quality reviewer dispatch

---

## Task 3: C3 PWA service worker (8 step)

**Files:**
- Create: `public/sw.js`, `app/offline/page.tsx`, `components/pwa-register.tsx`
- Modify: `app/layout.tsx`
- Test: `__tests__/components/pwa-register.test.ts`

### - [ ] Step 1: context7 로 Next.js 15 + service worker 표준 확인

`mcp__plugin_context7_context7__query-docs nextjs "service worker registration app router"` 또는 Exa 검색.

또는 단순 vanilla SW (next-pwa 의존성 도입 회피):
- public/sw.js 직접 작성
- client component 가 navigator.serviceWorker.register('/sw.js')

### - [ ] Step 2: public/sw.js 작성

```js
// public/sw.js
// keepioo PWA service worker — offline 캐싱 + push 이벤트 listener
// (push 발송 부분은 1단계 subscribe 만, 실제 발송은 추후 phase)

const CACHE_NAME = "keepioo-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// stale-while-revalidate — GET 만 적용
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached || caches.match(OFFLINE_URL));
      return cached || fresh;
    }),
  );
});

// push event listener — 1단계 (실제 발송은 추후)
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "keepioo", body: "새 정책 알림" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
    }),
  );
});
```

### - [ ] Step 3: app/offline/page.tsx 작성

```tsx
// app/offline/page.tsx
// service worker 가 fetch 실패 시 fallback. 단순 안내 페이지.
export const metadata = {
  title: "오프라인 — keepioo",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-3">오프라인 모드</h1>
        <p className="text-sm text-grey-700 leading-[1.6] mb-6">
          인터넷 연결이 끊겼어요. 캐시된 페이지만 이용 가능합니다.
        </p>
        <a
          href="/"
          className="inline-block px-5 py-3 bg-blue-500 text-white rounded-lg font-bold no-underline"
        >
          홈으로
        </a>
      </div>
    </main>
  );
}
```

### - [ ] Step 4: components/pwa-register.tsx 작성

```tsx
"use client";
// keepioo PWA service worker 등록 + push subscribe (선택).
// 사용자 동의 없이 push subscribe 안 함 (브라우저 기본 권한 prompt).

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // 등록만 — push subscribe 는 사용자 명시 동의 후 별도 호출
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("[PWA] sw 등록 실패:", err));
  }, []);

  return null;
}
```

### - [ ] Step 5: app/layout.tsx 에 PWARegister 마운트

기존 RootLayout 의 적절 위치에 `<PWARegister />` 추가.

### - [ ] Step 6: tsc + vitest 검증 + 단위 테스트

```ts
// __tests__/components/pwa-register.test.ts
import { describe, expect, it } from "vitest";

describe("PWARegister", () => {
  it("module import 성공", async () => {
    const mod = await import("@/components/pwa-register");
    expect(mod.PWARegister).toBeDefined();
  });
});
```

### - [ ] Step 7: Commit (push 안 함)

```bash
git add public/sw.js \
  app/offline/page.tsx \
  components/pwa-register.tsx \
  app/layout.tsx \
  __tests__/components/pwa-register.test.ts
git commit -m "feat(pwa): service worker (offline + push) + PWARegister + offline 페이지 (Phase 4 C3)
..."
```

### - [ ] Step 8: spec + code quality reviewer dispatch

---

## Task 4: Phase 4 마무리 (5 step)

### - [ ] Step 1: Phase 4 final reviewer dispatch
### - [ ] Step 2: master push (Task 1 + 2 + 3 묶음)
### - [ ] Step 3: 메모리 신규 작성 (`project_keepioo_phase4_user_value.md`)
### - [ ] Step 4: MEMORY.md 추가
### - [ ] Step 5: 마스터 plan ✅ 표시

---

## 자체 리뷰 체크리스트

- [x] DDL 0 (기존 테이블 활용, 신청 트래킹 별도 보류)
- [x] 사용자 명시 동의 후 push subscribe (브라우저 기본 prompt)
- [x] 단위 테스트 (정렬·추천·sw 등록)
- [x] PWA install 가능 (manifest 이미 있음 + sw 등록)

---

## 사장님 외부 액션 (선택)

Phase 4 push 후:
1. 모바일 chrome 에서 keepioo.com 접속 → "홈 화면에 추가" 가능 확인
2. /offline 직접 접속해서 안내 정상 표시 확인
3. /mypage/bookmarks 정렬·필터 + /mypage/notifications/history 페이지네이션 dogfood

---

**Why:** 트래픽 들어와도 재방문 없으면 의미 없음. C2 (마이페이지 보강) 으로 사용자 진입 경험 개선, C1 (compare 확장) 으로 핵심 USP 강화, C3 (PWA) 로 모바일 retention 확보.

**How to apply:** Task 1·2·3 독립이라 순차 진행. 각 task 별 spec + quality reviewer + 핫픽스 + push 패턴.
