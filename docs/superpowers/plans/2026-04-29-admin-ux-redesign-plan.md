# 어드민 UI/UX 재배치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo 어드민 페이지 20개 + 메인 대시보드를 사이드 메뉴 5 그룹 구조로 재배치 (토스 TDS 라이트 톤 + 반응형 3 break).

**Architecture:** `app/admin/layout.tsx` 신규 도입으로 모든 admin 페이지에 사이드바 자동 적용. sub page 자체 코드 변경 0 (회귀 위험 0). 메인 페이지는 ActionCard 그리드 제거 + 4 섹션 (alert 배너·24h KPI 4·30일 추세·최근 활동) 으로 슬림화.

**Tech Stack:** Next.js 15 App Router · React Server Components · Tailwind v4 · `usePathname` (활성 메뉴 매칭) · vitest (단위 테스트).

**Spec:** `docs/superpowers/specs/2026-04-29-admin-ux-redesign-design.md` (commit 42e527c).

---

## File Structure

### 신규 (6개)
- `lib/admin/menu.ts` — 그룹 5 + 페이지 18 메타데이터 단일 source + 활성 매칭 헬퍼
- `lib/admin/__tests__/menu.test.ts` — vitest 단위 테스트
- `lib/admin/dashboard-alerts.ts` — "지금 처리 필요" 3 신호 fetch (cron 실패·press-ingest 적체·만료 탈퇴)
- `components/admin/sidebar.tsx` — 클라이언트 컴포넌트, 사이드바 메뉴 렌더 + 활성 highlight
- `components/admin/sidebar-mobile-toggle.tsx` — 클라이언트 컴포넌트, 햄버거 + slide + ESC + dim
- `components/admin/admin-page-header.tsx` — 표준 헤더 슬롯 (kicker · title · description)
- `app/admin/layout.tsx` — 사이드바 + 메인 grid 레이아웃 + 인증 가드

### 변경 (1개)
- `app/admin/page.tsx` — ActionCard 그리드 제거, 4 섹션만 (alert 배너 + KPI 4 + 30일 추세 + 최근 활동) + 사용자 검색 form anchor

---

## 1차 범위 vs 후속

**1차 (본 plan, 8 commit):**
- 사이드바 + 모바일 햄버거 + 헤더 슬롯 컴포넌트
- 메인 대시보드 슬림화 (4 섹션)
- alert 배너 3 신호 (cron / press-ingest / 만료 탈퇴)

**후속 (별도 plan, 본 plan 끝나고):**
- alert 배너 4번째 신호 (Supabase advisor WARN) — 메모리 캐시 또는 cron 사전 fetch 결정 필요
- 각 admin sub page 헤더 슬롯 점진 마이그레이션
- 사이드바 즐겨찾기 / Cmd+K 검색

---

## Task 1: lib/admin/menu.ts — 메뉴 데이터 + 활성 매칭

**Files:**
- Create: `lib/admin/menu.ts`
- Test: `lib/admin/__tests__/menu.test.ts`

- [ ] **Step 1: 테스트 파일 작성 (실패 확인용)**

```typescript
// lib/admin/__tests__/menu.test.ts
import { describe, it, expect } from "vitest";
import { ADMIN_MENU, findActiveMenuItem } from "../menu";

describe("ADMIN_MENU 구조", () => {
  it("그룹 5개", () => {
    expect(ADMIN_MENU).toHaveLength(5);
  });

  it("그룹별 번호 1~5 순차", () => {
    expect(ADMIN_MENU.map((g) => g.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("총 페이지 메뉴 항목 18개", () => {
    const total = ADMIN_MENU.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(18);
  });

  it("href 중복 없음", () => {
    const hrefs: string[] = [];
    for (const g of ADMIN_MENU) {
      for (const i of g.items) hrefs.push(i.href);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("findActiveMenuItem", () => {
  it("정확 일치 — /admin/health", () => {
    const item = findActiveMenuItem("/admin/health");
    expect(item?.href).toBe("/admin/health");
  });

  it("동적 라우트 prefix — /admin/users/abc123 → /admin/users", () => {
    const item = findActiveMenuItem("/admin/users/abc-123");
    expect(item?.href).toBe("/admin/users");
  });

  it("긴 prefix 우선 — /admin/news/backfill-dedupe-runner 정확 매칭", () => {
    const item = findActiveMenuItem("/admin/news/backfill-dedupe-runner");
    expect(item?.href).toBe("/admin/news/backfill-dedupe-runner");
  });

  it("/admin/blog/abc → /admin/blog", () => {
    const item = findActiveMenuItem("/admin/blog/abc-123");
    expect(item?.href).toBe("/admin/blog");
  });

  it("매칭 없음 → null", () => {
    const item = findActiveMenuItem("/admin/unknown-page");
    expect(item).toBeNull();
  });

  it("/admin (메인 대시보드) → null (메뉴 그룹 항목 외)", () => {
    const item = findActiveMenuItem("/admin");
    expect(item).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run lib/admin/__tests__/menu.test.ts
```
Expected: FAIL — `Cannot find module '../menu'`

- [ ] **Step 3: lib/admin/menu.ts 구현**

```typescript
// lib/admin/menu.ts
// ============================================================
// 어드민 사이드바 메뉴 단일 source of truth (5 그룹 / 페이지 18)
// ============================================================
// 그룹 순서 = 사장님 운영 우선순위 (운영점검 → 컨텐츠 → 알림 → 지표 → 사용자).
// 새 admin 페이지 추가 시 여기에만 추가하면 사이드바·활성 매칭 자동 반영.
// ============================================================

export type AdminMenuItem = {
  href: string;
  label: string;
  icon: string;
};

export type AdminMenuGroup = {
  number: number;
  title: string;
  items: AdminMenuItem[];
};

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    number: 1,
    title: "운영 상태",
    items: [
      { href: "/admin/health", label: "헬스 대시보드", icon: "📊" },
      { href: "/admin/cron-trigger", label: "cron 수동 실행", icon: "⚙️" },
      { href: "/admin/cron-failures", label: "cron 실패 알림", icon: "🚨" },
      { href: "/admin/my-actions", label: "내 감사 로그", icon: "📋" },
      { href: "/admin/enrich-detail", label: "공고 detail 보강", icon: "🔧" },
    ],
  },
  {
    number: 2,
    title: "컨텐츠 발행",
    items: [
      { href: "/admin/press-ingest", label: "광역 보도자료 후보", icon: "🤖" },
      { href: "/admin/welfare/new", label: "복지 정책 신규", icon: "➕" },
      { href: "/admin/loan/new", label: "대출 정책 신규", icon: "➕" },
      { href: "/admin/news", label: "뉴스 모더레이션", icon: "📰" },
      { href: "/admin/news/backfill-dedupe-runner", label: "뉴스 dedupe 백필", icon: "🔄" },
      { href: "/admin/blog", label: "블로그 목록", icon: "✍️" },
    ],
  },
  {
    number: 3,
    title: "알림 발송",
    items: [
      { href: "/admin/alimtalk", label: "카카오톡 발송", icon: "📤" },
      { href: "/admin/alert-simulator", label: "알림 시뮬레이터", icon: "🧪" },
    ],
  },
  {
    number: 4,
    title: "지표·분석",
    items: [
      { href: "/admin/insights", label: "사용자 funnel", icon: "📈" },
      { href: "/admin/targeting", label: "본문 targeting 분석", icon: "🎯" },
      { href: "/admin/business", label: "자영업자 자격 진단", icon: "🏪" },
    ],
  },
  {
    number: 5,
    title: "사용자",
    items: [
      // /admin/users 정적 페이지 없음 — 사용자 검색 form 은 /admin (대시보드) 안에 있음.
      // 메뉴 클릭 시 /admin#user-search anchor 로 스크롤. 메인 page.tsx 가 id="user-search" 부여.
      { href: "/admin#user-search", label: "사용자 조회", icon: "👤" },
      { href: "/admin/wishes", label: "위시리스트", icon: "❤️" },
    ],
  },
];

// ─── 활성 메뉴 매칭 ───
// 정확 일치 우선, 그렇지 않으면 가장 긴 prefix 매칭.
// 예: /admin/news/backfill-dedupe-runner 는 /admin/news 보다 긴 prefix 라
// 정확히 backfill 메뉴가 활성으로 잡힘.
export function findActiveMenuItem(currentPath: string): AdminMenuItem | null {
  // 정확 일치
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (item.href === currentPath) return item;
    }
  }
  // 가장 긴 prefix 매칭
  let best: AdminMenuItem | null = null;
  let bestLen = -1;
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      // anchor (#user-search) 가 있는 항목은 path 매칭 X
      if (item.href.includes("#")) continue;
      if (currentPath.startsWith(`${item.href}/`) && item.href.length > bestLen) {
        best = item;
        bestLen = item.href.length;
      }
    }
  }
  return best;
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run lib/admin/__tests__/menu.test.ts
```
Expected: PASS — 모든 테스트 통과 (12 assertions)

- [ ] **Step 5: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/admin/menu.ts lib/admin/__tests__/menu.test.ts
git commit -m "feat(admin/menu): 사이드바 메뉴 단일 source + 활성 매칭 헬퍼

5 그룹·19 페이지 + findActiveMenuItem (정확/긴 prefix 우선).
vitest 단위 테스트 11건."
```

---

## Task 2: components/admin/sidebar.tsx — 사이드바 컴포넌트

**Files:**
- Create: `components/admin/sidebar.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/sidebar.tsx
"use client";

// ============================================================
// 어드민 사이드바 — 메뉴 그룹 5개 + 활성 highlight
// ============================================================
// 'use client' 이유: usePathname 으로 활성 메뉴 매칭.
// onItemClick prop: 모바일 토글에서 메뉴 클릭 시 닫기 연결용 (옵션).
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MENU, findActiveMenuItem } from "@/lib/admin/menu";

type Props = {
  onItemClick?: () => void;
};

export function Sidebar({ onItemClick }: Props) {
  const pathname = usePathname() ?? "/admin";
  const activeItem = findActiveMenuItem(pathname);
  const activeHref = activeItem?.href ?? null;

  // 메인 대시보드는 별도 (그룹 항목 외)
  const isDashboardActive = pathname === "/admin" || pathname.startsWith("/admin?");

  return (
    <nav
      aria-label="어드민 메뉴"
      className="bg-[#F7F8FA] border-r border-[#E5E8EB] py-6 h-full overflow-y-auto"
    >
      {/* 브랜드 */}
      <div className="px-6 pb-4 mb-3 border-b border-[#E5E8EB]">
        <div className="text-[18px] font-extrabold tracking-[-0.03em] text-[#191F28]">
          keepioo
        </div>
        <div className="text-[11px] text-[#8B95A1] mt-1 tracking-[0.1em] font-bold">
          ADMIN
        </div>
      </div>

      {/* 메인 대시보드 */}
      <Link
        href="/admin"
        onClick={onItemClick}
        className={
          isDashboardActive
            ? "flex items-center gap-2.5 px-6 py-3.5 text-[14px] font-bold bg-[#EBF3FE] border-l-[3px] border-[#3182F6] text-[#3182F6] pl-[21px] no-underline"
            : "flex items-center gap-2.5 px-6 py-3.5 text-[14px] font-bold text-[#4E5968] hover:bg-[#F2F4F6] no-underline"
        }
      >
        <span className="text-[18px]">🏠</span>
        대시보드
      </Link>

      {/* 그룹 5개 */}
      {ADMIN_MENU.map((group) => (
        <div key={group.number}>
          <div className="px-6 pt-5 pb-2 text-[10px] tracking-[0.12em] uppercase font-bold text-[#8B95A1]">
            {group.number}. {group.title}
          </div>
          {group.items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={
                  isActive
                    ? "flex items-center gap-2.5 py-3 text-[14px] font-bold bg-[#EBF3FE] border-l-[3px] border-[#3182F6] text-[#3182F6] pl-[33px] pr-6 no-underline"
                    : "flex items-center gap-2.5 py-3 pl-9 pr-6 text-[14px] text-[#4E5968] hover:bg-[#F2F4F6] no-underline"
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat(admin/sidebar): 사이드바 컴포넌트 (5 그룹 + 활성 highlight)

토스 TDS 톤 (#F7F8FA / #3182F6 / #4E5968).
'use client' usePathname 으로 활성 매칭."
```

---

## Task 3: components/admin/sidebar-mobile-toggle.tsx — 모바일 햄버거

**Files:**
- Create: `components/admin/sidebar-mobile-toggle.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/sidebar-mobile-toggle.tsx
"use client";

// ============================================================
// 모바일 햄버거 + slide-in 사이드바 (md 미만)
// ============================================================
// md 이상에선 sidebar 가 layout 에서 직접 렌더되므로 본 컴포넌트는 hidden.
// ESC·overlay 클릭·메뉴 항목 클릭 모두 닫기.
// ============================================================

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";

export function SidebarMobileToggle() {
  const [isOpen, setIsOpen] = useState(false);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // body scroll lock 시 오픈
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  return (
    <>
      {/* 햄버거 버튼 — 모바일만 */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
        className="md:hidden fixed top-3 left-3 z-40 w-11 h-11 bg-white border border-[#E5E8EB] rounded-lg flex items-center justify-center text-[20px] cursor-pointer shadow-sm"
      >
        ☰
      </button>

      {/* dim 오버레이 */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden
        />
      )}

      {/* 슬라이드 사이드바 */}
      <div
        role="dialog"
        aria-label="어드민 메뉴"
        aria-modal={isOpen}
        className={`md:hidden fixed top-0 left-0 bottom-0 w-[78%] max-w-[300px] z-50 bg-[#F7F8FA] shadow-[4px_0_16px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="메뉴 닫기"
          className="absolute top-3 right-3 z-10 w-10 h-10 bg-[#3182F6] text-white rounded-lg flex items-center justify-center text-[18px] cursor-pointer"
        >
          ×
        </button>
        <div className="h-full overflow-y-auto pt-14">
          <Sidebar onItemClick={() => setIsOpen(false)} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/admin/sidebar-mobile-toggle.tsx
git commit -m "feat(admin/sidebar): 모바일 햄버거 + slide-in (ESC·overlay·메뉴 클릭 닫기)

md 미만에서만 노출. body scroll lock + role=dialog 접근성."
```

---

## Task 4: components/admin/admin-page-header.tsx — 표준 헤더 슬롯

**Files:**
- Create: `components/admin/admin-page-header.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/admin-page-header.tsx
// ============================================================
// 어드민 페이지 표준 헤더 슬롯 — kicker · title · description
// ============================================================
// 각 admin sub page 가 점진 마이그레이션 시 사용. 1차 plan 에서는
// 메인 대시보드 (/admin) 만 도입. 후속 plan 에서 다른 페이지로 확장.
// ============================================================

type Props = {
  kicker?: string;
  title: string;
  description?: string;
};

export function AdminPageHeader({
  kicker = "ADMIN",
  title,
  description,
}: Props) {
  return (
    <div className="mb-8">
      <p className="text-[12px] text-[#3182F6] font-bold tracking-[0.18em] mb-2 uppercase">
        {kicker}
      </p>
      <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-[-0.04em] text-[#191F28] mb-2">
        {title}
      </h1>
      {description && (
        <p className="text-[14px] md:text-[15px] text-[#4E5968] leading-[1.6] max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add components/admin/admin-page-header.tsx
git commit -m "feat(admin/header): 표준 페이지 헤더 슬롯 (kicker·title·description)

토스 톤 32px 큰 제목 + 1.6 행간 + max-w-2xl 본문 가독성."
```

---

## Task 5: lib/admin/dashboard-alerts.ts — "지금 처리 필요" 신호

**Files:**
- Create: `lib/admin/dashboard-alerts.ts`

- [ ] **Step 1: 모듈 작성**

```typescript
// lib/admin/dashboard-alerts.ts
// ============================================================
// 메인 대시보드 "지금 처리 필요" 배너 — 3 신호 (1차 plan 범위)
// ============================================================
// cron 실패 / press-ingest 적체 / 만료 탈퇴 미처리.
// 4번째 advisor security WARN 은 후속 plan (cache 전략 결정 후).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getPressIngestKpi } from "@/lib/press-ingest/filter";

export type DashboardAlert = {
  key: "cron_failure" | "press_ingest_backlog" | "deletions_overdue";
  label: string;
  count: number;
  href: string;
};

const PRESS_INGEST_BACKLOG_THRESHOLD = 30;

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 병렬 fetch — 외부 RPC 3회 (각 head:true count exact)
  const [cronRes, pressKpi, deletionsRes] = await Promise.all([
    admin
      .from("cron_failure_log")
      .select("id", { count: "exact", head: true })
      .gte("notified_at", since24h),
    getPressIngestKpi(),
    admin
      .from("pending_deletions")
      .select("user_id", { count: "exact", head: true })
      .lt("scheduled_delete_at", nowIso),
  ]);

  const alerts: DashboardAlert[] = [];

  if ((cronRes.count ?? 0) >= 1) {
    alerts.push({
      key: "cron_failure",
      label: "cron 실패 알림",
      count: cronRes.count ?? 0,
      href: "/admin/cron-failures",
    });
  }

  if (pressKpi.candidates_24h >= PRESS_INGEST_BACKLOG_THRESHOLD) {
    alerts.push({
      key: "press_ingest_backlog",
      label: "광역 보도자료 후보 적체",
      count: pressKpi.candidates_24h,
      href: "/admin/press-ingest",
    });
  }

  if ((deletionsRes.count ?? 0) >= 1) {
    alerts.push({
      key: "deletions_overdue",
      label: "만료 탈퇴 미처리",
      count: deletionsRes.count ?? 0,
      href: "/admin#user-search",
    });
  }

  return alerts;
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/admin/dashboard-alerts.ts
git commit -m "feat(admin/dashboard): 지금 처리 필요 alert 3 신호

cron 실패 / press-ingest 적체 (≥30) / 만료 탈퇴.
병렬 fetch (cron_failure_log · getPressIngestKpi · pending_deletions).
4번째 advisor 신호는 후속 plan."
```

---

## Task 6: app/admin/layout.tsx — 사이드바 + 메인 grid 레이아웃

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1: layout 작성**

```tsx
// app/admin/layout.tsx
// ============================================================
// 어드민 공통 레이아웃 — 사이드바 + 메인 grid + 인증 가드
// ============================================================
// 모든 /admin/* 페이지에 자동 적용. sub page 자체 가드는 그대로 유지
// (defense in depth). 메인 영역 padding 은 반응형 (16/24/48).
// ============================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { Sidebar } from "@/components/admin/sidebar";
import { SidebarMobileToggle } from "@/components/admin/sidebar-mobile-toggle";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 인증 가드 — sub page 도 자체 가드 유지하므로 중복이지만 안전 마진.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user.email)) redirect("/");

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop 사이드바 — md 이상 */}
      <aside className="hidden md:block flex-shrink-0 w-[200px] xl:w-[280px]">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile 햄버거 + slide */}
      <SidebarMobileToggle />

      {/* 메인 영역 */}
      <main className="flex-1 min-w-0 px-4 md:px-7 xl:px-12 py-6 md:py-10 max-md:pt-16">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 3: 빌드 검증**

```bash
npx next build 2>&1 | tail -30
```
Expected: 빌드 성공, 에러 0

- [ ] **Step 4: 커밋**

```bash
git add app/admin/layout.tsx
git commit -m "feat(admin/layout): 사이드바 + 메인 grid 레이아웃 도입

모든 /admin/* 페이지에 자동 적용 (sub page 자체 코드 변경 0).
인증 가드 + 반응형 (16px/24/48 padding) + sticky 사이드바.
md 이상 desktop 사이드바 / md 미만 햄버거 + slide."
```

---

## Task 7: app/admin/page.tsx 슬림화 — 4 섹션 대시보드

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: 기존 page.tsx 읽기**

```bash
wc -l app/admin/page.tsx
```
약 ~700 줄 예상. 기존 ActionCard 그리드 (관리 페이지 카드 15+) 위치 식별.

- [ ] **Step 2: page.tsx 슬림화**

기존 4 섹션 (24h KPI 카드 8 / 사용자 조회 form / 빠른 액션 그리드 / 최근 가입 / 30일 추세 / 최근 결제 등) 중:
- **유지**: searchUser server action / get24hStats / getRecentSignups / getDailySignups·Revenue / 최근 활동
- **유지 + 위치 변경**: 사용자 조회 form (id="user-search" anchor 추가)
- **제거**: 관리 페이지 ActionCard 그리드 (사이드바로 이전)
- **신규**: AdminPageHeader 사용 / DashboardAlertBanner / KPI 4 카드 (8 → 4 축소)

새 page.tsx 구조:

```tsx
// app/admin/page.tsx (변경된 헤더 + 섹션 부분만 발췌, 기존 server actions 와 data fetcher 는 그대로 유지)

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getDashboardAlerts } from "@/lib/admin/dashboard-alerts";
// 기존 import 유지 (createClient, requireAdmin, get24hStats, getRecentSignups, getDailySignups, getDailyRevenueEstimated, getRecentPayments, getActorActionsPaged, etc.)

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireAdmin();
  const params = await searchParams;

  const [
    stats,
    recentSignups,
    actorActionsPaged,
    summaryKpi,
    signupsDaily,
    revenueDaily,
    recentPayments,
    alerts, // 신규
  ] = await Promise.all([
    get24hStats(),
    getRecentSignups(5),
    getActorActionsPaged(actor.id, { limit: 5, offset: 0 }),
    getSummaryKpi(),
    getDailySignups(30),
    getDailyRevenueEstimated(30),
    getRecentPayments(5),
    getDashboardAlerts(), // 신규
  ]);

  return (
    <>
      <AdminPageHeader
        kicker="ADMIN"
        title="대시보드"
        description="실시간 운영 상태 + 24시간 핵심 지표 한눈에."
      />

      {params.error && (
        <div role="alert" className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red mb-4">
          {params.error}
        </div>
      )}

      {/* 1. "지금 처리 필요" 배너 — alerts 0 이면 hide */}
      {alerts.length > 0 && (
        <section className="mb-6 bg-[#FFF5F5] border border-[#FCC] rounded-xl p-5">
          <div className="text-[13px] text-[#E74C3C] font-extrabold tracking-[0.04em] mb-2">
            ⚠️ 지금 처리 필요
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#FCC] rounded-md text-[13px] text-[#191F28] font-medium no-underline hover:border-[#E74C3C]"
              >
                {a.label}
                <span className="text-[#E74C3C] font-bold">{a.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 2. 24h KPI 4 카드 (기존 8 → 4 축소) */}
      <section className="mb-6">
        <div className="text-[13px] text-[#6B7684] font-bold tracking-[0.06em] uppercase mb-3">
          최근 24시간 운영 지표
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label="신규 가입" value={stats.newUsers} suffix="명" />
          <KpiCard label="활성 구독" value={stats.activeSubs} suffix="명" />
          <KpiCard label="자동 등록" value={stats.autoIngested} suffix="건" />
          <KpiCard
            label="cron 실패"
            value={stats.cronAlertsNew}
            suffix="건"
            tone={stats.cronAlertsNew >= 1 ? "warn" : "neutral"}
          />
        </div>
      </section>

      {/* 3. 30일 추세 차트 — 기존 component 유지 */}
      <section className="mb-6">
        <div className="text-[13px] text-[#6B7684] font-bold tracking-[0.06em] uppercase mb-3">
          30일 추세
        </div>
        <DailyTrendChart signups={signupsDaily} revenue={revenueDaily} />
      </section>

      {/* 4. 최근 활동 — 가입 5 + 내 작업 5 */}
      <section className="mb-6 grid md:grid-cols-2 gap-4">
        <RecentSignupsList signups={recentSignups} />
        <MyRecentActions records={actorActionsPaged.records} />
      </section>

      {/* 5. 사용자 조회 — anchor 위치 (사이드바 "사용자 조회" 메뉴 클릭 시 스크롤) */}
      <section id="user-search" className="mb-6 scroll-mt-20">
        <div className="text-[13px] text-[#6B7684] font-bold tracking-[0.06em] uppercase mb-3">
          사용자 조회
        </div>
        <form action={searchUser} className="flex gap-2 max-md:flex-col">
          <input
            type="text"
            name="query"
            required
            placeholder="이메일 또는 UUID"
            className="flex-1 px-4 py-3 border border-[#E5E8EB] rounded-lg text-[14px] focus:border-[#3182F6] focus:outline-none bg-white"
          />
          <button
            type="submit"
            className="px-5 py-3 bg-[#3182F6] text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            조회
          </button>
        </form>
      </section>

      {/* (제거됨) 관리 페이지 ActionCard 그리드 — 사이드바로 이전 */}
      {/* (제거됨) 24h 알림 발송 / 뉴스 / 공고 / AI 카드 — 각 그룹 페이지에 이미 있음 */}
    </>
  );
}

// 기존 KpiCard / RecentSignupsList / DailyTrendChart / MyRecentActions / searchUser server action 등은
// 이 파일에 그대로 유지. 변경된 건 default export 의 JSX 트리만.
```

**중요:** 위는 변경 부분 발췌. 실제 step 에서는 page.tsx 전체를 새로 작성하되 server actions / 기존 helper component 코드는 그대로 옮겨오기. 기존 SectionHeader / KpiCard / fmtRelative / searchUser server action 모두 유지.

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

- [ ] **Step 4: 빌드 검증**

```bash
npx next build 2>&1 | tail -30
```
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin/dashboard): 메인 대시보드 슬림화 — 4 섹션

기존 ActionCard 그리드 제거 (사이드바로 이전).
24h KPI 카드 8 → 4 축소 (가입·구독·자동등록·cron실패).
신규 \"지금 처리 필요\" 배너 (alert 3 신호).
사용자 조회 form 은 #user-search anchor 로 위치 (사이드바 메뉴 link 대상).
30일 추세 + 최근 활동은 기존 그대로 유지.
AdminPageHeader 첫 도입."
```

---

## Task 8: 회귀 검증 — 모든 admin sub page visual 확인

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 로컬 dev 서버 실행 (다른 터미널)**

```bash
npm run dev
```
대기: `localhost:3000` ready.

- [ ] **Step 2: 자동화 visual 검증 — 데스크탑 1280px+**

각 페이지 1번씩 visit + 스크린샷:

```bash
# 또는 chrome 자동화 도구 사용
```

확인 페이지 (19개 + 메인):
- /admin
- /admin/health
- /admin/cron-trigger
- /admin/cron-failures
- /admin/my-actions
- /admin/enrich-detail
- /admin/press-ingest
- /admin/welfare/new
- /admin/loan/new
- /admin/news
- /admin/news/backfill-dedupe-runner
- /admin/blog
- /admin/alimtalk
- /admin/alert-simulator
- /admin/insights
- /admin/targeting
- /admin/business
- /admin/wishes
- /admin/users/[적당한 UUID] (동적 라우트)
- /admin/blog/[적당한 UUID] (동적 라우트)

각 페이지 검증 포인트:
- 사이드바 노출 + 활성 메뉴 highlight 정확
- sub page 자체 콘텐츠 정상 (회귀 0)
- 페이지 헤더 (h1) 사이드바와 시각 충돌 없음
- 메인 영역 padding 일관

- [ ] **Step 3: 모바일 검증 — 390px 너비**

브라우저 dev tools → 390x844 (iPhone 14) → /admin 진입:
- 사이드바 자동 숨김 + 햄버거 ☰ 좌상단 노출
- 햄버거 클릭 → 슬라이드 인 + dim 오버레이
- 메뉴 항목 클릭 → 자동 닫힘 + 페이지 이동
- ESC 키 → 닫힘
- overlay 클릭 → 닫힘
- KPI 카드 2 col 적응

- [ ] **Step 4: 태블릿 검증 — 1024px**

dev tools → 1024x768:
- 사이드바 200px 압축 (xl break 1280 미만)
- KPI 그리드 2 col

- [ ] **Step 5: 접근성 빠른 점검**

- Tab 네비 — 햄버거 → 메뉴 항목 순차
- ESC 닫기 (모바일 사이드바 열림 상태)
- focus ring `#3182F6` 표시
- aria-label 사이드바·햄버거·닫기 버튼 모두

- [ ] **Step 6: prod 배포 빌드 (final 검증)**

```bash
npx next build 2>&1 | tail -50
```
Expected: 빌드 성공, 에러 0, warning 0 (또는 기존 warning 동일)

- [ ] **Step 7: 최종 커밋 (검증만 한 경우 commit 없음, 메모리·문서 갱신 시만)**

회귀·이슈 발견 시 hot-fix → 별도 commit. 발견 0 이면 본 단계 commit 없음.

```bash
# 메모리 갱신 (선택)
# .claude/memory 디렉터리 외부라 별도 작업
```

---

## Self-Review

### Spec coverage
| 스펙 항목 | Task |
|---|---|
| IA 사이드 메뉴 5 그룹 + 페이지 매핑 | T1 (menu.ts) |
| 활성 메뉴 매칭 (정확/긴 prefix) | T1 (findActiveMenuItem) |
| 사이드바 컴포넌트 (토스 톤) | T2 |
| 모바일 햄버거 + slide + ESC + dim | T3 |
| 헤더 슬롯 (kicker·title·description) | T4 |
| "지금 처리 필요" 신호 fetch (3종, 1차) | T5 |
| layout.tsx + 인증 가드 + 반응형 | T6 |
| 메인 page.tsx 슬림화 (4 섹션 + alert + KPI 4) | T7 |
| 회귀 검증 (20 페이지 + 3 break) | T8 |
| sub page 자체 변경 0 | T1~T8 모든 task 가 sub page 손대지 않음 ✓ |
| 4번째 신호 (advisor WARN) | **후속 plan** (1차 범위 외, 명시) |
| 헤더 슬롯 sub page 점진 마이그레이션 | **후속 plan** (1차 범위 외, 명시) |

### Placeholder scan
- "TBD" / "TODO" / 모호 표현: 0건
- 후속 plan 으로 분리한 항목 명확히 표기 ✓
- 모든 step 에 실제 코드 + 명령 포함 ✓

### Type consistency
- `findActiveMenuItem` 반환 타입 = `AdminMenuItem | null` (T1, T2 모두 일치)
- `DashboardAlert` shape = `{ key, label, count, href }` (T5 정의, T7 사용 일치)
- `Sidebar` props = `{ onItemClick? }` (T2 정의, T3 사용 일치)
- `AdminPageHeader` props = `{ kicker?, title, description? }` (T4 정의, T7 사용 일치)

전 task 일관성 OK.

---

## 작업 시간 추정

| Task | 추정 시간 |
|---|---|
| T1 (menu + 테스트) | 25분 |
| T2 (sidebar) | 20분 |
| T3 (mobile-toggle) | 25분 |
| T4 (header) | 5분 |
| T5 (alerts) | 20분 |
| T6 (layout) | 15분 |
| T7 (page slim) | 35분 |
| T8 (검증) | 30분 |
| **합계** | **~3시간** |

8 commit / 신규 파일 6 + 변경 1 = sub page 회귀 위험 0 + 운영 가시성·페이지 찾기 부담 대폭 ↓.
