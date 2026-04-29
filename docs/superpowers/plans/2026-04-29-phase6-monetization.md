# Phase 6 — 수익화 implementation plan (2026-04-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Phase 2~5 의 트래픽·재방문·마케팅 인프라 위에 monetize. E1 (Pro 차별화 가시성) + E2 (AdSense manual slot).

**Architecture:**
- E1 = Tier badge (마이페이지·헤더·결제) + Free → Pro 업그레이드 CTA + GA4 결제 funnel 이벤트
- E2 = AdSlot 컴포넌트 강화 (placeholder → 진짜 AdSense in-feed) + 5개 위치 추가 (홈·hub·eligibility·카드 그리드)
- **DDL 0** — 기존 subscriptions·tier 인프라 활용
- AI 신청서 자동 작성 (LLM) 은 keepio_agent 중복 위험으로 보류

**Tech Stack:** Next.js 15 / Supabase / Toss / Google AdSense / GA4.

---

## File Structure

### E1 — Pro 차별화 가시성 (3h)
- **Create:** `components/tier-badge.tsx` — `<TierBadge tier="pro" />` 재사용
- **Create:** `components/upgrade-cta.tsx` — "Pro 로 업그레이드" CTA 카드
- **Modify:** `app/mypage/account-tab.tsx` — Tier badge + 현 구독 상태 강조
- **Modify:** `app/mypage/notifications/page.tsx` — Free 사용자에게 Pro 알림 차별화 CTA
- **Modify:** `lib/ga4.ts` (또는 비슷) — `pricing_card_clicked`, `checkout_started`, `upgrade_cta_clicked` GA4 이벤트 추가
- **Modify:** `app/pricing/page.tsx` + `app/pricing/checkout-link.tsx` — 결제 funnel 이벤트 trigger
- **Test:** `__tests__/components/tier-badge.test.ts` — props·라벨 검증

### E2 — AdSense manual slot (2h)
- **Modify:** `components/ad-slot.tsx` — 진짜 AdSense in-feed 슬롯 (data-ad-slot env 가드, lazy load)
- **Modify:** `app/page.tsx` (홈) — 인기 정책 섹션 아래 AdSlot
- **Modify:** `app/c/[category]/page.tsx` — hub 페이지 마감 임박 섹션 아래 AdSlot
- **Modify:** `app/eligibility/[slug]/page.tsx` — 카테고리 모음 페이지 정책 list 위
- **Modify:** `app/welfare/page.tsx`, `app/loan/page.tsx` — 카드 그리드 in-feed 슬롯 (5번째 카드 자리)
- **Test:** `__tests__/components/ad-slot.test.ts` — env 미설정 시 graceful skip 검증

---

## 사장님 외부 액션

Phase 6 push 후:
1. AdSense 콘솔에서 in-feed 광고 단위 신규 생성 → `data-ad-slot` ID 복사
2. Vercel env 등록:
   - `NEXT_PUBLIC_ADSENSE_SLOT_INFEED` (in-feed 슬롯 ID)
   - 기존 `NEXT_PUBLIC_ADSENSE_CLIENT` (publisher ID, ca-pub-...) 재사용
3. AdSense 첫 노출 후 24h 모니터링 (GA4 + AdSense 콘솔)

---

## Task 1: E1 Pro 차별화 가시성 (10 step)

**Files:**
- Create: `components/tier-badge.tsx`, `components/upgrade-cta.tsx`, `__tests__/components/tier-badge.test.ts`
- Modify: `app/mypage/account-tab.tsx`, `app/mypage/notifications/page.tsx`, `app/pricing/page.tsx`, `app/pricing/checkout-link.tsx`, `lib/ga4.ts`

### Step 1. lib/ga4.ts 위치·기존 이벤트 확인
`lib/ga4.ts` 또는 비슷 파일 read. 기존 trackEvent / GA_EVENTS 패턴 파악. 새 이벤트 추가 위치 식별.

### Step 2. components/tier-badge.tsx 작성

```tsx
// components/tier-badge.tsx
// Tier 시각화 — 마이페이지·결제·헤더에 재사용. 한국어 라벨 + 색상 코드.

import { TIER_NAMES, type Tier } from "@/lib/subscription";

const TIER_STYLES: Record<Tier, string> = {
  free: "bg-grey-100 text-grey-700 border-grey-200",
  basic: "bg-blue-50 text-blue-700 border-blue-200",
  pro: "bg-amber-50 text-amber-700 border-amber-200",
};

export function TierBadge({ tier, size = "sm" }: { tier: Tier; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${TIER_STYLES[tier]} ${sizeClass}`}
    >
      {tier === "pro" && <span aria-hidden>✨</span>}
      {TIER_NAMES[tier]}
    </span>
  );
}
```

### Step 3. components/upgrade-cta.tsx 작성

```tsx
// components/upgrade-cta.tsx
// Free/Basic 사용자에게 Pro 업그레이드 권유 CTA. 마이페이지·알림·검색에 노출.

import Link from "next/link";
import { TierBadge } from "./tier-badge";

interface Props {
  currentTier: "free" | "basic"; // pro 사용자에겐 노출 X
  // 호출 위치 — GA4 이벤트 source 구분용
  source: "mypage" | "notifications" | "search" | "alerts";
}

export function UpgradeCta({ currentTier, source }: Props) {
  const targetTier = currentTier === "free" ? "basic" : "pro";
  const message = currentTier === "free"
    ? "🏪 사장님 자격 자동 진단 + 카톡 알림 받으려면"
    : "✨ AI 상담 무제한 + 신청서 초안 작성하려면";
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-sm text-amber-900 mb-3">{message}</p>
      <Link
        href={`/pricing?from=${source}`}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold no-underline"
      >
        <TierBadge tier={targetTier} /> 업그레이드 →
      </Link>
    </div>
  );
}
```

### Step 4. lib/ga4 에 새 이벤트 추가
- `pricing_card_clicked` (tier param)
- `checkout_started` (tier param)
- `upgrade_cta_clicked` (source + currentTier + targetTier)

### Step 5. account-tab.tsx 에 TierBadge 추가
사용자 이메일 옆 또는 기본 정보 섹션 상단에 `<TierBadge tier={userTier} size="md" />`.

### Step 6. mypage/notifications page 에 UpgradeCta 추가 (Free 사용자만)
페이지 상단 또는 빈 상태 영역에 `<UpgradeCta currentTier="free" source="notifications" />`.

### Step 7. pricing 페이지 + checkout-link 결제 funnel 이벤트
- pricing 카드 클릭 시 `pricing_card_clicked`
- checkout 버튼 클릭 시 `checkout_started`

### Step 8. 단위 테스트 (tier-badge 4 case + upgrade-cta 분기 2 case)

### Step 9. tsc + vitest 검증

### Step 10. Commit (push 안 함)

```bash
git add components/tier-badge.tsx components/upgrade-cta.tsx \
  app/mypage/account-tab.tsx app/mypage/notifications/page.tsx \
  app/pricing/page.tsx app/pricing/checkout-link.tsx \
  lib/ga4.ts \
  __tests__/components/tier-badge.test.ts
git commit -m "feat(monetize): Tier badge + Free→Pro 업그레이드 CTA + GA4 결제 funnel (Phase 6 E1)
..."
```

---

## Task 2: E2 AdSense manual slot (8 step)

**Files:**
- Modify: `components/ad-slot.tsx` (placeholder → 진짜 AdSense)
- Modify: `app/page.tsx`, `app/c/[category]/page.tsx`, `app/eligibility/[slug]/page.tsx`, `app/welfare/page.tsx`, `app/loan/page.tsx`
- Test: `__tests__/components/ad-slot.test.ts`

### Step 1. 기존 adsense-lazy-loader.tsx 코드 read
이미 자동광고 lazy load 처리 패턴 파악. AdSlot 강화 시 재사용 가능.

### Step 2. components/ad-slot.tsx 강화

```tsx
// components/ad-slot.tsx
// AdSense in-feed 슬롯 — env 미설정 시 placeholder, 설정 시 진짜 광고.
// PWA·offline 환경에선 표시 안 함 (offline 페이지가 광고 없는게 자연스러움).

"use client";
import { useEffect, useRef } from "react";

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // ca-pub-...
const SLOT_INFEED = process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED;

export function AdSlot({ format = "fluid" }: { format?: "fluid" | "auto" }) {
  const ref = useRef<HTMLModElement | null>(null);
  useEffect(() => {
    if (!PUBLISHER_ID || !SLOT_INFEED) return;
    if (typeof window === "undefined") return;
    try {
      // @ts-ignore — adsbygoogle 전역
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.warn("[AdSlot] push 실패:", err);
    }
  }, []);

  // env 미설정 → placeholder (개발/preview 환경 안전)
  if (!PUBLISHER_ID || !SLOT_INFEED) {
    return (
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        <div className="border-t border-b border-grey-100 py-4 text-center text-xs text-grey-500">
          광고 (env 미설정)
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-content mx-auto px-10 max-md:px-6 my-4">
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-format={format}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={SLOT_INFEED}
      />
    </div>
  );
}
```

### Step 3. 단위 테스트 (env 미설정 시 placeholder + 설정 시 ins 태그 렌더 mock)

### Step 4. app/page.tsx (홈) 에 AdSlot 추가
인기 정책 섹션과 다음 섹션 사이.

### Step 5. app/c/[category]/page.tsx 에 AdSlot 추가
마감 임박 섹션과 가이드 섹션 사이.

### Step 6. app/eligibility/[slug]/page.tsx 에 AdSlot 추가
정책 list 위 또는 list 5번째 항목 자리.

### Step 7. welfare/loan list 카드 그리드 in-feed
첫 페이지 5번째 카드 자리에 AdSlot. (page > 1 은 skip — 이탈률 ↓)

### Step 8. tsc + vitest 검증 + Commit

```bash
git add components/ad-slot.tsx \
  app/page.tsx app/c/[category]/page.tsx app/eligibility/[slug]/page.tsx \
  app/welfare/page.tsx app/loan/page.tsx \
  __tests__/components/ad-slot.test.ts
git commit -m "feat(adsense): AdSlot in-feed 강화 + 5개 위치 추가 (Phase 6 E2)
..."
```

---

## Task 3: Phase 6 마무리

### - [ ] Step 1: Phase 6 final reviewer dispatch
### - [ ] Step 2: master push
### - [ ] Step 3: 메모리 신규 작성 (`project_keepioo_phase6_monetization.md`)
### - [ ] Step 4: MEMORY.md 추가
### - [ ] Step 5: 마스터 plan ✅ — **6 phase 모두 완료** 표시
### - [ ] Step 6: 전체 6 phase 완료 보고 (사장님)

---

## 자체 리뷰 체크리스트

- [x] DDL 0 (기존 subscriptions·tier 활용)
- [x] env 미설정 graceful (AdSlot placeholder, GA4 미설정도 안전)
- [x] Pro 사용자에겐 UpgradeCta 미노출 (currentTier 'pro' 분기)
- [x] keepio_agent 중복 위험 회피 (AI 신청서 보류)

---

**Why:** 마지막 phase. Phase 1~5 의 인프라 위에 monetize 종결. 신규 기능보다 기존 차별화 가시성·결제 funnel 이 ROI 큼.

**How to apply:** Task 1 → Task 2 순차. 각 task spec + quality reviewer + 핫픽스 패턴 동일.
