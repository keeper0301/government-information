# Phase 1 — Core Web Vitals 핫픽스 설계 (C 패키지)

**작성일**: 2026-04-28
**대상**: keepioo.com 모바일 성능 베이스라인 핫픽스
**범위**: 홈 33점 → 70+, 4페이지 80→90+, 회귀 위험 관리

---

## 1. 동기와 컨텍스트

### 1.1 베이스라인 측정 (2026-04-28, lighthouse mobile)

| 페이지 | 점수 | LCP | CLS | TBT | FCP | SI |
|---|---|---|---|---|---|---|
| home | **33** 🔴 | 5.8s | 0.154 | 1,970ms | 3.8s | 5.3s |
| welfare | 78 🟡 | 4.2s | 0.016 | 160ms | 2.8s | 3.7s |
| loan | 77 🟡 | 4.5s | 0.016 | 70ms | 3.1s | 3.8s |
| news | 77 🟡 | 3.8s | 0.016 | 280ms | 2.6s | 4.1s |
| blog | 80 🟢 | 4.3s | 0.01 | 70ms | 2.6s | 3.6s |

### 1.2 홈 메인스레드 8.2초 분포

- Other (Chrome 내부): 3,154ms
- Style & Layout: 2,689ms
- Script Evaluation: 1,261ms
- Rendering: 859ms
- Script Parse/Compile: 152ms
- Parse HTML/CSS: 44ms

### 1.3 JS 실행 1위는 외부 스크립트 (홈)

| URL | 총 시간 | scripting |
|---|---|---|
| Next 청크 4bd1b696 | 512ms | 271ms |
| **AdSense show_ads** | **428ms** | **383ms** |
| Next 청크 3794 | 388ms | 347ms |
| GA4 gtag | 153ms | 133ms |
| AdSense adsbygoogle | 85ms | 66ms |

### 1.4 진단 결론

1. **AdSense `afterInteractive`** — hydration 직후 동기 로드되어 critical path 차단
2. **홈 컴포넌트 12개 SSR 동시 렌더** — DOM 비대 → Style/Layout 2.7초
3. **폰트 CDN @import** — globals.css 의 `@import` 는 렌더 차단
4. **next/image priority 미적용** — LCP 후보 이미지 우선 로드 안 됨

---

## 2. 목표

| 지표 | 현재 (홈) | 목표 (홈) | 4페이지 평균 목표 |
|---|---|---|---|
| 점수 | 33 | 70+ | 85+ |
| LCP | 5.8s | 2.5s | 3.0s |
| TBT | 1,970ms | 300ms | 100ms |
| CLS | 0.154 | 0.10 | 0.05 |

---

## 3. 변경 범위 (Section 1~5)

### Section 1. AdSense lazy load 전환

**파일**: `app/layout.tsx`, `components/ad-slot.tsx` (또는 동등 컴포넌트)

**변경 내용**:
- `app/layout.tsx` 의 `<Script id="adsense-loader">` 의 `strategy="afterInteractive"` → `strategy="lazyOnload"`
- AdSlot 컴포넌트 (광고 푸시 지점) 가 IntersectionObserver 로 viewport 진입 시 `(window.adsbygoogle = window.adsbygoogle || []).push({})` 호출하도록 수정
- 위 IntersectionObserver 의 root margin `200px` (스크롤 직전 미리 로드)

**근거**: AdSense show_ads_impl JS 가 메인스레드 383ms scripting 점유. lazyOnload 로 idle 시 로드하면 critical path 에서 빠짐.

**예상 효과**: TBT -400ms, LCP -1.0s

---

### Section 2. 홈 below-the-fold dynamic import

**파일**: `app/page.tsx`, `app/layout.tsx`

**즉시 렌더 (above-the-fold)**:
- `Hero section` (검색박스·CTA·HomeRecommendCard)
- `HomeJsonLd` (SEO)
- `HomeTargetCards`
- `EnhanceProfileBanner` (조건부)

**dynamic import 로 변경 (below-the-fold)**:
- `HeroStats`
- `RegionMap`
- `CalendarPreview`
- `AlertStrip`
- `BlogCategoryChips` + `BlogCard` 그리드
- `NewsCard` 그리드
- `FeatureGrid`
- `HomeCTA`
- `FloatingWishWidget`
- `HomePopularPicks` (sidebar)

**`app/layout.tsx`**:
- `ChatbotPanel` 을 `next/dynamic({ loading: () => null })` 로 변경

**dynamic import 전략 (client vs server 구분)**:

Next.js 16 의 `next/dynamic` 은 client component 만 가능. server component 는 React `<Suspense>` 로 streaming 해야 효과가 있다.

**client component (interactive)** — `next/dynamic`:
```ts
const ChatbotPanel = dynamic(() => import("@/components/chatbot-panel").then(m => ({ default: m.ChatbotPanel })), {
  loading: () => null,
});
```
- 대상 후보: `ChatbotPanel`, `FloatingWishWidget`, `AlertStrip`(IntersectionObserver), `BlogCategoryChips`, `HomePopularPicks` 등 client component 만
- `ssr: false` 는 **사용 금지** (SEO 영향). 서버 렌더는 유지하되 JS 청크만 분리

**server component (data fetch)** — `<Suspense>` streaming:
```tsx
<Suspense fallback={<div className="h-[300px]" aria-hidden />}>
  <HeroStats />
</Suspense>
```
- 대상 후보: `HeroStats`, `RegionMap`, `CalendarPreview`, `BlogCard 그리드`, `NewsCard 그리드`, `FeatureGrid`, `HomeCTA` 등 server component
- 효과: HTML 이 chunk 단위로 streaming → 첫 chunk (above-the-fold) 가 빨리 도착

**plan 단계에서 각 컴포넌트를 client/server 분류 후 적절한 전략 선택**

- placeholder 높이 = 컴포넌트 평균 높이 (CLS 회귀 방지)

**근거**: 홈 페이지의 main bundle 청크가 1MB+. dynamic import 로 청크 분할하면 main 청크 작아져 parse/eval 시간 단축. SSR 유지로 SEO 회귀 0.

**예상 효과**: 홈 점수 +20~25점, FCP -0.5s

---

### Section 3. LCP 최적화 (이미지 + 폰트)

**3a. 폰트 preload**

**현재**: `app/globals.css` 에 Pretendard CDN `@import` (렌더 차단)

**변경**:
- `app/globals.css` 의 Pretendard `@import` 제거
- `app/layout.tsx` 의 `<head>` 에 `<link rel="preload" href="..." as="style">` + `<link rel="stylesheet" href="..." media="print" onload="this.media='all'">` 패턴 적용
- 또는 `next/font/local` 로 self-host (더 안정적이지만 Pretendard Variable woff2 다운로드 필요)

**선택**: 1차로 `<link rel="preload">` + media swap 패턴 (변경 최소). 효과 부족하면 후속 phase 에서 self-host.

**3b. LCP 이미지 priority**

**현재 LCP 후보**: Hero 영역의 첫 이미지 (배경 blob 은 CSS gradient 라 무관)

**변경**:
- `RegionMap` 의 SVG 또는 첫 이미지 (`next/image`) 에 `priority` + `fetchPriority="high"` 추가
- Hero 의 ` <img>` 가 있다면 동일 처리 (현재는 SVG/CSS 만 사용 가능)

**근거**: priority 명시 시 Next.js 가 `<link rel="preload">` 자동 생성

**예상 효과**: LCP -0.5~1.0s, FCP -0.3s

---

### Section 4. 4페이지 마이너 fix

**파일**: `app/welfare/page.tsx`, `app/loan/page.tsx`, `app/news/page.tsx`, `app/blog/page.tsx`

**변경**:
- 위 1·2 변경이 layout.tsx 에 있어 자동 적용 (AdSense lazy + ChatbotPanel dynamic)
- 각 페이지 첫 카드 그리드의 첫 카드 `<img>` 또는 `next/image` 에 `priority` 추가 (LCP 후보)

**예상 효과**: 4페이지 점수 77~80 → 85~90, LCP 4s대 → 3s대

---

### Section 5. 검증 + 롤백 전략

**검증 절차**:
1. 모든 변경 후 같은 `npx lighthouse` 5페이지 모바일 재측정
2. before/after 표 자동 생성 (Node 스크립트)
3. 시각 회귀: 사장님 chrome 검증 (홈 + welfare + ChatbotPanel 늦게 뜨는지 OK)
4. 점수 회귀 시 즉시 `git revert <commit>` 후 부분 적용 재시도

**롤백 트리거**:
- 홈 점수 < 50 (베이스라인 +17 미달)
- 어느 페이지든 점수 -10 이상 회귀
- CLS > 0.25 (placeholder 높이 미스매치)
- ChatbotPanel/FloatingWishWidget 노출 안 됨 (dynamic 실패)

**`.gitignore` 추가**:
- `.lighthouse-results/` (측정 결과 JSON 6개, 631KB×5 = 3MB+)

---

## 4. 변경 파일 요약 (예상)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `app/layout.tsx` | AdSense strategy + ChatbotPanel dynamic + 폰트 preload link |
| 2 | `app/page.tsx` | below-the-fold dynamic import 10개 |
| 3 | `app/globals.css` | Pretendard @import 제거 |
| 4 | `components/ad-slot.tsx` | IntersectionObserver lazy push |
| 5 | `components/region-map.tsx` | LCP 이미지 priority |
| 6 | `app/{welfare,loan,news,blog}/page.tsx` | 첫 카드 priority |
| 7 | `.gitignore` | `.lighthouse-results/` |

총 7~10 파일 예상.

---

## 5. 의존성·리스크

### 의존성
- 없음 — 기존 `next/dynamic`, `next/script`, `next/image` 사용

### 리스크

| 리스크 | 완화책 |
|---|---|
| dynamic placeholder 높이 미스매치 → CLS 회귀 | 컴포넌트 평균 높이 측정 후 `min-h-[Npx]` 명시 |
| AdSense lazy 로 광고 노출 늦어짐 → 매출 영향 | IntersectionObserver root margin 200px 로 스크롤 직전 push, 매출 영향 최소화 |
| 폰트 swap 시 깜빡임 | `font-display: swap` + 시스템 폰트 fallback 명시 |
| ChatbotPanel dynamic 실패 시 사용자 미노출 | error boundary + console.error 로깅 |
| LCP 이미지 잘못 식정 → priority 효과 0 | lighthouse `largest-contentful-paint-element` 결과 재확인 |

### 검증 게이트
- 코드 변경 후 lighthouse 재측정 통과 (위 5.0 의 롤백 트리거 미충족) → push
- 사장님 chrome 검증 (홈 + 4페이지 시각 회귀 0)

---

## 6. 진행 순서 (plan 후)

1. **Section 1** AdSense lazy 단독 커밋 → 측정 → 검증
2. **Section 3a** 폰트 preload 단독 커밋 → 측정
3. **Section 2** below-the-fold dynamic 단독 커밋 → 측정
4. **Section 3b** LCP priority 단독 커밋 → 측정
5. **Section 4** 4페이지 fix 단독 커밋 → 측정
6. **최종 before/after 표** 작성 + 메모리 갱신

각 커밋 후 즉시 측정해서 점수 변화 추적. 한 번에 다 묶지 않음 — 회귀 발생 시 문제 커밋 즉시 식정 가능.

---

## 7. 성공 기준

- ✅ 홈 모바일 점수 70+ (현재 33)
- ✅ 4페이지 모바일 점수 85+ (현재 77~80)
- ✅ CLS 모든 페이지 < 0.1
- ✅ 시각 회귀 0 (사장님 chrome 검증)
- ✅ AdSense 광고 노출 정상 (스크롤 시)

위 5개 모두 충족 시 Phase 1 완료. 미달 시 후속 phase (D 풀 패키지 — DOM 다이어트) 검토.
