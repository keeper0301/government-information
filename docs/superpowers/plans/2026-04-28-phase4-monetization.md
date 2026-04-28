# Phase 4 — 수익화 묶음 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 수익화 3 영역 한 번에 — A AdSense 자동 광고 활성화, B 결제·구독 funnel 이벤트 5개 추가 + 사용처 박기, C /admin/insights 에 가입·구독 funnel 카드.

**Architecture:** Section 별 단독 commit. AdSense 는 lazy loader 안 onload 콜백에 자동 광고 push 1줄. 결제 이벤트는 enum 추가 + pricing/checkout/cancel 4~5곳 trackEvent 호출. funnel 카드는 server-side count 쿼리 + UI 컴포넌트.

**Tech Stack:** Next.js 16 (server component), Supabase admin client (auth.users·user_profiles·user_alert_rules·subscriptions count), GA4 trackEvent, AdSense Auto Ads (`enable_page_level_ads`)

**Spec:** `docs/superpowers/specs/2026-04-28-phase4-monetization-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `components/adsense-lazy-loader.tsx` | modify | 자동 광고 push (script onload 콜백 1줄) |
| `lib/analytics.ts` | modify | EVENTS 5 신규 (결제·구독 funnel) |
| `app/pricing/page.tsx` | modify | PRICING_VIEWED page view 발사 (server → client tracker) |
| `components/pricing/checkout-link.tsx` (또는 app/pricing/checkout-link.tsx) | modify | PRICING_PLAN_SELECTED·CHECKOUT_STARTED 발사 |
| `app/checkout/success/page.tsx` | modify | CHECKOUT_COMPLETED·SUBSCRIPTION_ACTIVE 발사 (mount 시) |
| `app/checkout/fail/page.tsx` | modify | CHECKOUT_FAILED 발사 (mount 시, reason 파라미터) |
| `app/mypage/billing/page.tsx` (또는 cancel server action) | modify | SUBSCRIPTION_CANCELLED 발사 (cancel 클릭 시) |
| `lib/admin-funnel.ts` | create | server-side count 쿼리 (가입·구독 funnel 4·3 단계) |
| `components/admin/funnel-cards.tsx` | create | UI 카드 (가입·구독 funnel + 진행률 bar) |
| `app/admin/insights/page.tsx` | modify | FunnelCards 컴포넌트 추가 |

총 ~10 파일.

---

## Task 1: AdSense 자동 광고 push 추가

**Files:** `components/adsense-lazy-loader.tsx`

- [ ] **Step 1.1: load 함수의 script append 후 onload 콜백 추가**

기존 `load` 함수:
```tsx
const load = () => {
  if (loaded) return;
  loaded = true;
  cleanup();
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
  document.head.appendChild(s);
};
```

변경 후:
```tsx
const load = () => {
  if (loaded) return;
  loaded = true;
  cleanup();
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
  // 자동 광고 (Auto Ads) — Google 이 페이지 빈 공간에 자동 광고 삽입.
  // AdSense 콘솔에서 자동 광고 ON 후 효과 시작. 미승인 사이트는 광고 안 채워짐.
  s.onload = () => {
    try {
      const w = window as unknown as { adsbygoogle: Array<Record<string, unknown>> };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({
        google_ad_client: ADSENSE_ID,
        enable_page_level_ads: true,
      });
    } catch {
      /* 자동 광고 활성 실패 — 무시, 수동 슬롯 보존 */
    }
  };
  document.head.appendChild(s);
};
```

- [ ] **Step 1.2: 타입 체크 + 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 1.3: 커밋**

```bash
git add components/adsense-lazy-loader.tsx
git commit -m "feat(adsense): 자동 광고 (Auto Ads) push — 콘솔 ON 시 즉시 광고 삽입"
```

---

## Task 2: 결제·구독 funnel EVENTS 5 추가

**Files:** `lib/analytics.ts`

- [ ] **Step 2.1: EVENTS 객체에 5 신규 enum 추가**

`lib/analytics.ts:32` (PRICING_VIEWED 영역) 다음에:

```ts
  // 결제 / 구독
  PRICING_VIEWED: "pricing_viewed",
  CHECKOUT_STARTED: "checkout_started",
  // 결제·구독 funnel 보강 (2026-04-28 Phase 4)
  PRICING_PLAN_SELECTED: "pricing_plan_selected",   // 가격표 플랜 클릭 (plan 파라미터)
  CHECKOUT_COMPLETED: "checkout_completed",          // 토스 결제 성공 (success 페이지)
  CHECKOUT_FAILED: "checkout_failed",                // 토스 결제 실패 (reason 파라미터)
  SUBSCRIPTION_ACTIVE: "subscription_active",        // 빌링키 + 첫 청구 성공
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",  // 사용자 취소
```

- [ ] **Step 2.2: 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

(Task 2 단독 commit 안 함 — Task 3·4·5 와 함께)

---

## Task 3: pricing 페이지 이벤트 박기

**Files:** `app/pricing/page.tsx` 또는 `app/pricing/checkout-link.tsx`

### 3.1 — 현재 구조 파악

- [ ] **Step 3.1.1: 파일 read**

```bash
# 두 파일 모두 read 후 trackEvent 호출이 어디 가능한지 확인
```

`app/pricing/page.tsx` 가 server component 면 PRICING_VIEWED 는 client tracker 컴포넌트로 분리 필요.
`app/pricing/checkout-link.tsx` 는 client 일 가능성 큼 — 플랜 클릭 핸들러 안에 PRICING_PLAN_SELECTED.

### 3.2 — PRICING_VIEWED (server 페이지면 client tracker 추가)

- [ ] **Step 3.2.1: page.tsx 가 server 면 mount 시 tracker 추가**

`app/pricing/page.tsx` 가 server 면 다음 client component import 추가:

```tsx
"use client";
import { useEffect } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

export function PricingViewedTracker() {
  useEffect(() => {
    trackEvent(EVENTS.PRICING_VIEWED, {});
  }, []);
  return null;
}
```

위 컴포넌트를 `components/pricing/page-view-tracker.tsx` 로 신설 후 page.tsx 에서 import + JSX 어딘가 추가:

```tsx
import { PricingViewedTracker } from "@/components/pricing/page-view-tracker";
// ...
<PricingViewedTracker />
```

만약 page.tsx 가 client component (`"use client"`) 면 useEffect 직접 추가.

### 3.3 — PRICING_PLAN_SELECTED + CHECKOUT_STARTED (checkout-link.tsx)

- [ ] **Step 3.3.1: checkout-link.tsx 의 onClick 핸들러에 trackEvent 추가**

`app/pricing/checkout-link.tsx` 의 플랜 버튼 onClick 핸들러 (또는 onSubmit) 안에:

```tsx
import { trackEvent, EVENTS } from "@/lib/analytics";
// ...
onClick={() => {
  trackEvent(EVENTS.PRICING_PLAN_SELECTED, { plan: planSlug });
  trackEvent(EVENTS.CHECKOUT_STARTED, { plan: planSlug });
  // 기존 navigate 로직
}}
```

`planSlug` 는 컴포넌트가 받는 prop 이름에 맞춰 (basic/pro 등).

만약 checkout-link 가 단순 `<Link>` 면 → 그 위에 wrapper button 으로 onClick 추가 또는 `onMouseDown` 패턴.

- [ ] **Step 3.3.2: 빌드**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

(Task 3 도 Task 4·5 와 한 commit)

---

## Task 4: checkout success/fail 이벤트 박기

**Files:**
- `app/checkout/success/page.tsx`
- `app/checkout/fail/page.tsx`

### 4.1 — success: CHECKOUT_COMPLETED + SUBSCRIPTION_ACTIVE

- [ ] **Step 4.1.1: success 페이지 read 후 client tracker 추가**

만약 success 페이지가 server component 면:
- 신규 `components/checkout/success-tracker.tsx` 생성 (client):
```tsx
"use client";
import { useEffect } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

export function CheckoutSuccessTracker({ plan, orderId }: { plan?: string; orderId?: string }) {
  useEffect(() => {
    trackEvent(EVENTS.CHECKOUT_COMPLETED, { plan: plan ?? "unknown", order_id: orderId ?? "" });
    trackEvent(EVENTS.SUBSCRIPTION_ACTIVE, { plan: plan ?? "unknown" });
  }, [plan, orderId]);
  return null;
}
```

- success page.tsx 에서 import + 페이지 안 어딘가 `<CheckoutSuccessTracker plan={...} orderId={...} />` 추가.

만약 client component 면 useEffect 직접 추가.

### 4.2 — fail: CHECKOUT_FAILED

- [ ] **Step 4.2.1: fail 페이지 read 후 client tracker 추가**

success 와 동일 패턴. reason 파라미터:

```tsx
"use client";
import { useEffect } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

export function CheckoutFailTracker({ reason }: { reason?: string }) {
  useEffect(() => {
    trackEvent(EVENTS.CHECKOUT_FAILED, { reason: reason ?? "unknown" });
  }, [reason]);
  return null;
}
```

fail page.tsx 가 URL 쿼리에서 `errorMessage` `errorCode` 받는다면 그 값을 reason 으로 전달.

### 4.3 — 빌드

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

(Task 5 와 함께 commit)

---

## Task 5: 구독 취소 이벤트 박기

**Files:** `app/mypage/billing/page.tsx` 또는 어디서든 구독 취소 처리하는 곳

### 5.1 — 취소 핸들러 위치 찾기

- [ ] **Step 5.1.1: 취소 server action·핸들러 grep**

```bash
grep -rn 'cancel.*subscription\|cancelSubscription\|SUBSCRIPTION_CANCELLED' app/ lib/ 2>/dev/null | head -10
```

찾은 파일에서 cancel 클릭 핸들러 또는 server action 호출 후 client 측 `trackEvent(EVENTS.SUBSCRIPTION_CANCELLED, {})` 추가.

### 5.2 — trackEvent 호출 추가

- [ ] **Step 5.2.1: client 측 cancel 버튼 onClick 또는 server action 응답 후 trackEvent**

server action 후 client 에서 fire 패턴:

```tsx
"use client";
async function handleCancel() {
  const result = await cancelSubscriptionAction(...);
  if (result.success) {
    trackEvent(EVENTS.SUBSCRIPTION_CANCELLED, { plan: result.plan ?? "unknown" });
  }
  // ...
}
```

### 5.3 — 빌드 + Task 2·3·4·5 한 commit

```bash
bunx tsc --noEmit 2>&1 | tail -5
bun run build 2>&1 | tail -5
git add lib/analytics.ts app/pricing/ app/checkout/ app/mypage/billing/ components/pricing/ components/checkout/
git commit -m "feat(analytics): 결제·구독 funnel 5 신규 이벤트 + pricing·checkout·cancel 트래킹"
```

`git add` 경로는 실제 변경된 파일에 맞춰 정정.

---

## Task 6: lib/admin-funnel.ts 신설 (가입·구독 funnel count)

**Files:** `lib/admin-funnel.ts` (신규)

- [ ] **Step 6.1: 파일 생성**

```ts
// lib/admin-funnel.ts
// /admin/insights funnel 카드용 server-side count 쿼리.
// 24h 단계별 카운트 — 가입 funnel 4단계 + 구독 funnel 3단계.
//
// admin client (service role) 사용 — auth.users RLS 우회 필요.

import { createServiceRoleClient } from "@/lib/supabase/admin"; // 기존 admin client 패턴 따름

export type SignupFunnel = {
  signup: number;          // 24h 신규 회원
  onboarded: number;       // 24h 신규 + 프로필 채움
  alertActive: number;     // 24h 신규 + 알림 활성
  subscribed: number;      // 24h 신규 + 활성 구독
};

export type SubscriptionFunnel = {
  newAttempts: number;     // 24h 구독 시도
  active: number;          // 현재 활성 구독 (전체)
  cancelled24h: number;    // 24h 취소
};

export async function getSignupFunnel24h(): Promise<SignupFunnel> {
  const sb = createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. 24h 신규 회원
  const { count: signup } = await sb
    .from("auth.users") // RLS 우회 — admin
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);

  // 2. 24h 신규 + 프로필 채움 (age_group 또는 region)
  const { data: newUsers } = await sb
    .from("auth.users")
    .select("id")
    .gte("created_at", since);
  const newIds = (newUsers ?? []).map((u) => u.id);

  let onboarded = 0;
  let alertActive = 0;
  let subscribed = 0;

  if (newIds.length > 0) {
    // 프로필 채움 (age_group, region, occupation 중 하나라도)
    const { count: ob } = await sb
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .in("id", newIds)
      .or("age_group.not.is.null,region.not.is.null,occupation.not.is.null");
    onboarded = ob ?? 0;

    // 알림 활성
    const { count: al } = await sb
      .from("user_alert_rules")
      .select("*", { count: "exact", head: true })
      .in("user_id", newIds)
      .eq("is_active", true);
    alertActive = al ?? 0;

    // 구독 활성
    const { count: sub } = await sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .in("user_id", newIds)
      .eq("status", "active");
    subscribed = sub ?? 0;
  }

  return {
    signup: signup ?? 0,
    onboarded,
    alertActive,
    subscribed,
  };
}

export async function getSubscriptionFunnel24h(): Promise<SubscriptionFunnel> {
  const sb = createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: newAttempts }, { count: active }, { count: cancelled24h }] = await Promise.all([
    sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since),
    sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .gte("cancelled_at", since),
  ]);

  return {
    newAttempts: newAttempts ?? 0,
    active: active ?? 0,
    cancelled24h: cancelled24h ?? 0,
  };
}
```

**중요**:
- `createServiceRoleClient` 의 정확한 import 경로 — 기존 admin 페이지 (예: `app/admin/page.tsx`) 의 import 패턴 따라
- `auth.users` 직접 query 가 안 되면 (Supabase 정책) `supabase.auth.admin.listUsers({ since })` 사용 (Service role 필요). 또는 public schema 의 mirror 테이블이 있으면 그것
- subscriptions 테이블의 컬럼명 — `status` `cancelled_at` 실제 이름 확인

- [ ] **Step 6.2: 타입 체크 + 함수 시그니처 정확성 확인**

```bash
bunx tsc --noEmit 2>&1 | tail -10
```

error 발생 시:
- import 경로 정정 (`createServiceRoleClient` 위치)
- subscriptions 컬럼 확인 (DB schema)
- auth.users count 가 안 되면 admin API listUsers 로 변경

(Task 6 도 Task 7·8 과 함께 commit)

---

## Task 7: components/admin/funnel-cards.tsx 신설

**Files:** `components/admin/funnel-cards.tsx` (신규)

- [ ] **Step 7.1: UI 컴포넌트 생성**

```tsx
// components/admin/funnel-cards.tsx
// /admin/insights funnel 카드 (server component, server-side count 결과 받음).
// 가입 funnel 4단계 + 구독 funnel 3단계, 진행률 bar 시각화.

import type { SignupFunnel, SubscriptionFunnel } from "@/lib/admin-funnel";

function pct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function FunnelBar({ label, count, max, transferLabel }: {
  label: string;
  count: number;
  max: number;
  transferLabel?: string;
}) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[14px] font-medium text-grey-800">{label}</span>
        <span className="text-[13px] text-grey-600 tabular-nums">
          {count.toLocaleString()}
          {transferLabel && <span className="ml-2 text-grey-500">({transferLabel})</span>}
        </span>
      </div>
      <div className="h-2 bg-grey-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function SignupFunnelCard({ funnel }: { funnel: SignupFunnel }) {
  const max = funnel.signup;
  return (
    <section className="bg-white border border-grey-100 rounded-2xl p-5">
      <h3 className="text-[16px] font-bold text-grey-900 mb-1">가입 funnel</h3>
      <p className="text-[12px] text-grey-500 mb-4">최근 24시간 신규 회원 단계별</p>
      <div className="space-y-3">
        <FunnelBar label="가입 완료" count={funnel.signup} max={max} />
        <FunnelBar
          label="온보딩 완료"
          count={funnel.onboarded}
          max={max}
          transferLabel={pct(funnel.onboarded, funnel.signup)}
        />
        <FunnelBar
          label="알림 활성"
          count={funnel.alertActive}
          max={max}
          transferLabel={pct(funnel.alertActive, funnel.signup)}
        />
        <FunnelBar
          label="구독 시작"
          count={funnel.subscribed}
          max={max}
          transferLabel={pct(funnel.subscribed, funnel.signup)}
        />
      </div>
    </section>
  );
}

export function SubscriptionFunnelCard({ funnel }: { funnel: SubscriptionFunnel }) {
  return (
    <section className="bg-white border border-grey-100 rounded-2xl p-5">
      <h3 className="text-[16px] font-bold text-grey-900 mb-1">구독 funnel</h3>
      <p className="text-[12px] text-grey-500 mb-4">최근 24시간 구독 활동</p>
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[12px] text-grey-500">신규 시도</dt>
          <dd className="text-[20px] font-bold text-grey-900 tabular-nums">{funnel.newAttempts}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-grey-500">활성 (전체)</dt>
          <dd className="text-[20px] font-bold text-blue-600 tabular-nums">{funnel.active}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-grey-500">24h 취소</dt>
          <dd className="text-[20px] font-bold text-grey-900 tabular-nums">{funnel.cancelled24h}</dd>
        </div>
      </dl>
    </section>
  );
}
```

- [ ] **Step 7.2: 타입 체크**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

(Task 8 과 함께 commit)

---

## Task 8: app/admin/insights/page.tsx 에 FunnelCards 추가

**Files:** `app/admin/insights/page.tsx`

- [ ] **Step 8.1: 페이지 read 후 import + JSX 추가**

`app/admin/insights/page.tsx` 의 import 영역:

```tsx
import { getSignupFunnel24h, getSubscriptionFunnel24h } from "@/lib/admin-funnel";
import { SignupFunnelCard, SubscriptionFunnelCard } from "@/components/admin/funnel-cards";
```

서버 컴포넌트 데이터 로드 영역에 (Promise.all 안 또는 별도 병렬):

```tsx
const [signupFunnel, subscriptionFunnel] = await Promise.all([
  getSignupFunnel24h(),
  getSubscriptionFunnel24h(),
]);
```

기존 KPI 카드 또는 섹션 후 다음 추가:

```tsx
<section className="grid gap-4 md:grid-cols-2 mb-8">
  <SignupFunnelCard funnel={signupFunnel} />
  <SubscriptionFunnelCard funnel={subscriptionFunnel} />
</section>
```

- [ ] **Step 8.2: 빌드 + 시각 확인**

```bash
bun run build 2>&1 | tail -5
```

Expected: error 0. 사장님 chrome 으로 /admin/insights 접속 → funnel 카드 노출 확인.

- [ ] **Step 8.3: Task 6+7+8 한 commit**

```bash
git add lib/admin-funnel.ts components/admin/funnel-cards.tsx app/admin/insights/page.tsx
git commit -m "feat(admin): /admin/insights 에 가입·구독 funnel 카드 추가 (DB count 기반)"
```

---

## Task 9: 종합 검증 + push

- [ ] **Step 9.1: lighthouse 회귀 측정 (선택)**

```bash
PORT=3100 bun run start &
sleep 3
npx -y lighthouse@latest http://localhost:3100 \
  --output=json --output-path=.lighthouse-results/home-mobile.json \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance --quiet
node -e "const r = require('./.lighthouse-results/home-mobile.json'); console.log('홈 점수:', Math.round(r.categories.performance.score * 100));"
```

Phase 1 baseline 83 대비 -5 이내면 OK. 회귀 시 자동 광고 코드가 영향 — `enable_page_level_ads` 가 lighthouse 측정 안에서 추가 JS 다운로드 trigger 가능. 그 경우 `s.onload` 안 push 를 setTimeout 으로 한 단계 더 지연 가능.

- [ ] **Step 9.2: chrome 검증**

playwright 또는 사장님 chrome:
- /admin/insights → 가입·구독 funnel 카드 노출, 카운트 정상
- /pricing → 페이지 진입 시 PRICING_VIEWED 발사 (devtools network gtag 호출)
- /pricing 플랜 클릭 → PRICING_PLAN_SELECTED 발사
- /checkout/success/?... 직접 URL → CHECKOUT_COMPLETED 발사 (사장님 본인 결제 후 또는 dev 환경)
- 콘솔 에러 0

- [ ] **Step 9.3: prod 서버 종료 + push (사장님 명시 후)**

```bash
git push origin master
```

- [ ] **Step 9.4: 메모리 갱신**

`project_keepioo_phase4_monetization_2026_04_28.md` 신설 + MEMORY.md 인덱스 추가:
- 변경 영역 (10 파일)
- 핵심 commits
- 외부 대기 (AdSense 콘솔·토스 라이브·GA4 funnel 정의)
- 다음 phase 추천

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 AdSense 자동 광고 | Task 1 | ✅ |
| Section 2 결제 funnel 5 이벤트 | Task 2 (enum) + 3·4·5 (사용처) | ✅ |
| Section 3 /admin funnel 카드 | Task 6·7·8 | ✅ |
| Section 4 검증·롤백 | Task 9 | ✅ |

### 2. 회귀 가드
- 각 task 후 typecheck (Step 1.2·2.2·3.3.2·4.3·5.3·6.2·7.2·8.2)
- Task 9 lighthouse 재측정 + chrome 시각 검증
- AdSense 자동 광고가 모바일 layout 깨면 사장님 콘솔에서 형식 조정

### 3. Type 일관성
- `SignupFunnel`·`SubscriptionFunnel` type — Task 6 정의, Task 7 사용
- EVENTS enum — Task 2 정의, Task 3·4·5 사용 (`EVENTS.PRICING_PLAN_SELECTED` 등)
- `createServiceRoleClient` — 기존 admin 페이지 패턴 따라야 (Step 6.1 의 가정 import 경로 정정 필요)

### 4. 위험 요소

- **`auth.users` 직접 query 안 될 수 있음** — Supabase 일부 RLS 정책상 admin client 도 차단. 그 경우 `supabase.auth.admin.listUsers({ since })` 또는 public schema mirror 사용
- **subscriptions 컬럼명** — `status`·`cancelled_at` 가 실제 이름 인지 확인 (다를 수 있음)
- **결제 server action·취소 핸들러 위치 불확실** — Step 5.1 grep 으로 사전 확인
- **AdSense `enable_page_level_ads` 가 모바일에서 sticky 광고 삽입** — 사장님 콘솔에서 광고 형식 조정 필요할 수 있음
- **`createServiceRoleClient` import 경로** — 기존 admin 페이지에서 어떤 함수 쓰는지 확인 (createClient vs admin client)

### 5. Plan 의 가정 코드 정정 필요 시점

- Task 3.1.1: pricing/page.tsx 가 server vs client 인지에 따라 분기
- Task 4.1.1: success/fail 페이지가 server vs client
- Task 5.1.1: cancel 핸들러 grep 결과
- Task 6.1: subscriptions 테이블 schema 확인

→ 실행 단계에서 각 파일 read 후 정확한 위치에 trackEvent 추가.

---

## 진행 후 보고

각 task 완료 후 짧게:
```
✅ Task N 완료
- 변경: <파일 N개>, 커밋: <hash>
- typecheck/build 통과
- 다음 task 진행
```

전체 완료 시:
```
✅ Phase 4 완료
- N commits push
- /admin/insights funnel 카드 정상
- 외부 대기: AdSense 자동광고 콘솔 ON, 토스 라이브, GA4 funnel 정의
- 다음 phase: Phase 5 (데이터 fetcher) 또는 Phase 6 (운영 모니터링)
```
