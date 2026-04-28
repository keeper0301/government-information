# Phase 1 — Core Web Vitals 핫픽스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 모바일 lighthouse 점수를 홈 33 → 70+, 4페이지 77~80 → 85+ 로 끌어올린다 (LCP/TBT/CLS 동시 개선).

**Architecture:** 5 단계 단계별 커밋 — (1) lighthouse 결과 gitignore, (2) AdSense lazyOnload, (3) Pretendard 폰트 preload, (4) 홈 below-the-fold dynamic/Suspense, (5) LCP 이미지 priority + 4페이지 fix. 각 단계 후 lighthouse 재측정으로 회귀 감지.

**Tech Stack:** Next.js 16 (App Router), React 19, `next/script`, `next/dynamic`, `next/image`, `@next/third-parties`, lighthouse CLI (npx, 영구 설치 X), Tailwind v4

**Spec:** `docs/superpowers/specs/2026-04-28-phase1-core-web-vitals-design.md`

**Baseline (2026-04-28 mobile)**:
- home: 33점 / LCP 5.8s / TBT 1,970ms / CLS 0.154
- welfare: 78 / loan: 77 / news: 77 / blog: 80

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `.gitignore` | modify | `.lighthouse-results/` 추적 제외 |
| `app/layout.tsx` | modify | AdSense `strategy="lazyOnload"` + 폰트 preload `<link>` + ChatbotPanel `next/dynamic` |
| `app/globals.css` | modify | Pretendard CDN `@import` 제거 (layout `<link>` 으로 이전) |
| `app/page.tsx` | modify | below-the-fold 컴포넌트 `next/dynamic` (client) 또는 `<Suspense>` (server) |
| `app/welfare/page.tsx` | modify | 첫 카드 `next/image` priority |
| `app/loan/page.tsx` | modify | 첫 카드 `next/image` priority |
| `app/news/page.tsx` | modify | 첫 카드 `next/image` priority |
| `app/blog/page.tsx` | modify | 첫 카드 `next/image` priority |
| `scripts/lighthouse-compare.mjs` | create | before/after 점수 비교 스크립트 (CI 아닌 로컬 검증용) |

총 9 파일.

---

## Pre-flight: 환경 확인

- [ ] **Step 0.1: 현재 브랜치·상태 확인**

```bash
git status
git branch --show-current
```

Expected: master 브랜치, working tree clean (Phase 1 spec 커밋 직후).

- [ ] **Step 0.2: lighthouse 베이스라인 결과 존재 확인**

```bash
ls -la .lighthouse-results/
```

Expected: `home-mobile.json`, `welfare-mobile.json`, `loan-mobile.json`, `news-mobile.json`, `blog-mobile.json` 5개 파일 (각 400~630KB). 없으면 다음 명령으로 재생성:

```bash
mkdir -p .lighthouse-results
for p in home welfare loan news blog; do
  url="https://www.keepioo.com"
  [ "$p" != "home" ] && url="$url/$p"
  npx -y lighthouse@latest "$url" \
    --output=json --output-path=".lighthouse-results/$p-mobile.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance --quiet
done
```

베이스라인을 별도 폴더로 백업 (after 측정과 비교):

```bash
cp -r .lighthouse-results .lighthouse-results-baseline
```

---

## Task 1: lighthouse 결과 gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1.1: 현재 `.gitignore` 끝부분 확인**

```bash
tail -20 .gitignore
```

- [ ] **Step 1.2: `.lighthouse-results/` 추가**

`.gitignore` 끝에 다음 두 줄 추가:

```
# 로컬 lighthouse 측정 결과 (Phase 1 Core Web Vitals 검증용, 약 3MB JSON)
.lighthouse-results/
.lighthouse-results-baseline/
```

- [ ] **Step 1.3: 추적 안 됨 확인**

```bash
git status .lighthouse-results/ .lighthouse-results-baseline/
```

Expected: ignored — 출력 없음 또는 "ignored" 메시지

- [ ] **Step 1.4: 커밋**

```bash
git add .gitignore
git commit -m "chore(perf): Phase 1 lighthouse 측정 결과 gitignore"
```

---

## Task 2: AdSense lazyOnload 전환

**Files:**
- Modify: `app/layout.tsx:102-110`

- [ ] **Step 2.1: 현재 AdSense 코드 재확인**

`app/layout.tsx` 102~110 라인:

```tsx
{process.env.NEXT_PUBLIC_ADSENSE_ID && (
  <Script
    id="adsense-loader"
    async
    strategy="afterInteractive"
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
    crossOrigin="anonymous"
  />
)}
```

- [ ] **Step 2.2: `strategy="lazyOnload"` 로 변경**

```tsx
{process.env.NEXT_PUBLIC_ADSENSE_ID && (
  <Script
    id="adsense-loader"
    async
    strategy="lazyOnload"
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
    crossOrigin="anonymous"
  />
)}
```

차이: `afterInteractive` (hydration 직후) → `lazyOnload` (브라우저 idle 시).

- [ ] **Step 2.3: 타입 체크 + 빌드 검증**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: error 0 (또는 기존 잔존 에러만, 새 에러 없음).

- [ ] **Step 2.4: 로컬 dev 서버 동작 확인 (선택, 사장님 chrome 검증)**

```bash
bun dev
```
홈 접속 → AdSense 라이브러리 network 탭에서 lazy 로 늦게 로드되는지 확인.

- [ ] **Step 2.5: 커밋**

```bash
git add app/layout.tsx
git commit -m "perf(adsense): strategy afterInteractive → lazyOnload (TBT 감축)"
```

- [ ] **Step 2.6: prod 푸시 후 lighthouse 재측정 — 또는 dev 측정**

prod 검증을 원할 경우:

```bash
git push origin master
# Vercel 배포 ~2분 대기 후
for p in home welfare loan news blog; do
  url="https://www.keepioo.com"
  [ "$p" != "home" ] && url="$url/$p"
  npx -y lighthouse@latest "$url" \
    --output=json --output-path=".lighthouse-results/$p-mobile.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance --quiet
done
```

- [ ] **Step 2.7: before/after 비교 (Task 8 의 스크립트 사전 사용 가능)**

비교 결과 캡처:
- 홈 점수 변화 (예상: 33 → 40~45)
- TBT 변화 (예상: 1,970 → 1,500ms)
- LCP 변화 (예상: 5.8 → 5.0s)

회귀 시: `git revert HEAD && git push` 후 분석.

---

## Task 3: Pretendard 폰트 preload

**Files:**
- Modify: `app/globals.css:1`
- Modify: `app/layout.tsx` (head section 추가)

- [ ] **Step 3.1: 현재 `app/globals.css` 1번째 라인 확인**

```css
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css");
```

이 `@import` 는 CSS 파싱 차단 → 폰트 다운로드 시작이 늦어짐.

- [ ] **Step 3.2: `app/globals.css` 의 Pretendard `@import` 삭제**

`app/globals.css` 1번째 라인 (Pretendard `@import`) 제거. 결과:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
@config "../tailwind.config.ts";

html { ... }
```

- [ ] **Step 3.3: `app/layout.tsx` 의 `<html>` 안에 `<head>` 추가**

`app/layout.tsx` 의 `return ( <html lang="ko"> <body> ...` 부분을:

```tsx
return (
  <html lang="ko">
    <head>
      {/* Pretendard 폰트 preload — globals.css @import 제거 후 직접 link.
          @import 는 CSS 파싱 차단이라 폰트 다운로드 늦어짐. <link rel="preload">
          + media swap 패턴으로 비차단 로딩 + 빠른 적용. */}
      <link
        rel="preload"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        as="style"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        media="print"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ onLoad: "this.media='all'" } as any)}
      />
      <noscript>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </noscript>
      {/* preconnect — cdn.jsdelivr.net 은 다른 자원도 사용 (Pretendard 외) */}
      <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
    </head>
    <body>
      ...
```

설명:
- `rel="preload"`: 브라우저가 즉시 다운로드 시작 (parser-blocking 아님)
- `rel="stylesheet" media="print" onLoad="this.media='all'"`: 다운로드는 하되 적용은 onload 후 → 비차단
- `<noscript>` fallback: JS 비활성 사용자도 폰트 적용
- `preconnect`: TLS handshake 미리

JSX 에서 `<link onLoad="문자열">` 직접 쓰면 React 가 함수 expected 오류 → `as any` cast 로 우회 (이 패턴은 well-known, 댓글로 명시).

- [ ] **Step 3.4: 빌드 검증**

```bash
bun run build 2>&1 | tail -20
```

Expected: 빌드 성공, lint 경고 0 (eslint-disable comment 추가했으므로).

- [ ] **Step 3.5: 시각 검증 — 폰트 깜빡임 확인**

dev 서버 또는 prod 에서 홈 접속 → 첫 1초에 시스템 폰트 (Apple SD Gothic Neo / Malgun Gothic) 으로 잠시 노출 후 Pretendard 로 swap. 너무 거슬리면 fallback 폰트의 metric override 추가 후속 검토.

- [ ] **Step 3.6: 커밋**

```bash
git add app/layout.tsx app/globals.css
git commit -m "perf(font): Pretendard CDN @import → preload + media swap (FCP 감축)"
```

- [ ] **Step 3.7: lighthouse 재측정 (Task 2.6 명령 동일)**

예상: FCP -300~500ms, LCP -300ms.

---

## Task 4: 홈 below-the-fold dynamic/Suspense

이 task 는 가장 큰 회귀 위험 — 5 단계로 쪼개 점진 적용.

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

### 4.A — ChatbotPanel + FloatingWishWidget dynamic (client component)

**대상**: layout.tsx 의 `ChatbotPanel`, page.tsx 의 `FloatingWishWidget`. 둘 다 화면 우/좌 하단 floating, 즉시 노출 불필요.

- [ ] **Step 4.A.1: `app/layout.tsx` 의 ChatbotPanel import 변경**

기존:
```tsx
import { ChatbotPanel } from "@/components/chatbot-panel";
```

변경:
```tsx
import dynamic from "next/dynamic";

const ChatbotPanel = dynamic(
  () => import("@/components/chatbot-panel").then((m) => ({ default: m.ChatbotPanel })),
  { loading: () => null },
);
```

위치: 다른 import 들과 함께 (1~10 라인 영역). `dynamic` import 는 따로 한 줄.

- [ ] **Step 4.A.2: `app/page.tsx` 의 FloatingWishWidget import 변경**

기존:
```tsx
import { FloatingWishWidget } from "@/components/wish-form-floating";
```

변경:
```tsx
import dynamic from "next/dynamic";

const FloatingWishWidget = dynamic(
  () => import("@/components/wish-form-floating").then((m) => ({ default: m.FloatingWishWidget })),
  { loading: () => null },
);
```

- [ ] **Step 4.A.3: 빌드 검증**

```bash
bun run build 2>&1 | tail -20
```

Expected: error 0. dynamic chunk 분리됨.

- [ ] **Step 4.A.4: 커밋**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "perf(home): ChatbotPanel·FloatingWishWidget next/dynamic (chunk 분리)"
```

### 4.B — RevealOnScroll 안의 server component 들에 Suspense 추가

**대상**: HeroStats, RegionMap, CalendarPreview, AlertStrip, BlogCard 그리드, NewsCard 그리드, FeatureGrid, HomeCTA. 모두 server component 이거나 비동기 fetch 있음.

전략: 각 `<RevealOnScroll>` 안의 컴포넌트를 `<Suspense fallback={...}>` 로 추가 감싼다 (RevealOnScroll 자체는 client wrapper 라 변경 X). Suspense fallback 높이는 컴포넌트 실제 평균 높이 (placeholder).

- [ ] **Step 4.B.1: `app/page.tsx` 의 import 에 Suspense 추가**

```tsx
import { Suspense } from "react";
```

이미 import 돼 있는지 확인 후 없으면 추가.

- [ ] **Step 4.B.2: HeroStats Suspense 감싸기**

기존:
```tsx
<RevealOnScroll>
  <HeroStats />
</RevealOnScroll>
```

변경:
```tsx
<RevealOnScroll>
  <Suspense fallback={<div className="h-[280px]" aria-hidden />}>
    <HeroStats />
  </Suspense>
</RevealOnScroll>
```

- [ ] **Step 4.B.3: RegionMap, CalendarPreview, AlertStrip, BlogCard 그리드, NewsCard 그리드, FeatureGrid, HomeCTA 도 같은 패턴**

placeholder 높이 권장:
- HeroStats: `h-[280px]`
- RegionMap: `h-[600px]`
- CalendarPreview: `h-[480px]`
- AlertStrip: `h-[60px]`
- BlogCard 그리드 + 헤더: `h-[420px]`
- NewsCard 그리드 + 헤더: `h-[420px]`
- FeatureGrid: `h-[400px]`
- HomeCTA: `h-[280px]`

각각 page.tsx 의 해당 위치를 위 Step 4.B.2 패턴으로 변경.

**예시 — Blog 섹션** (line 269~292 영역):

기존:
```tsx
{recentPosts.length > 0 && (
  <RevealOnScroll>
    <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
      <div className="flex items-baseline justify-between mb-6">
        ...
      </div>
      <BlogCategoryChips />
      <div className="grid gap-5 md:grid-cols-3">
        {recentPosts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  </RevealOnScroll>
)}
```

변경 (블로그 섹션 전체를 Suspense 로 감쌈):
```tsx
{recentPosts.length > 0 && (
  <RevealOnScroll>
    <Suspense fallback={<div className="h-[420px]" aria-hidden />}>
      <section className="py-20 px-10 max-w-content mx-auto max-md:py-[60px] max-md:px-6">
        <div className="flex items-baseline justify-between mb-6">
          ...
        </div>
        <BlogCategoryChips />
        <div className="grid gap-5 md:grid-cols-3">
          {recentPosts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </Suspense>
  </RevealOnScroll>
)}
```

- [ ] **Step 4.B.4: 빌드 + 시각 검증**

```bash
bun run build 2>&1 | tail -20
bun dev
```

홈 접속 후 스크롤 → 각 섹션이 placeholder 후 자연스럽게 노출되는지 확인. CLS 회귀 없는지 (placeholder 높이 ≈ 실제 높이).

- [ ] **Step 4.B.5: 커밋**

```bash
git add app/page.tsx
git commit -m "perf(home): below-the-fold 8 섹션 Suspense streaming (HTML 분할)"
```

### 4.C — lighthouse 재측정

```bash
# Task 2.6 의 측정 명령 재실행
```

예상 누적 효과 (Task 2 + 3 + 4 까지):
- 홈 점수: 33 → 60~70
- LCP: 5.8 → 3.0~3.5s
- TBT: 1,970 → 400~600ms
- CLS: 0.154 → 0.10 이하 (placeholder 정확하면)

CLS 가 회귀 (>0.15) 하면 placeholder 높이 재조정 (실측 후 Step 4.B.3 의 값 갱신).

---

## Task 5: LCP 이미지 priority + 4페이지 마이너 fix

**Files:**
- Modify: `app/page.tsx` (Hero 영역)
- Modify: `components/region-map.tsx` (LCP 후보)
- Modify: `app/welfare/page.tsx`
- Modify: `app/loan/page.tsx`
- Modify: `app/news/page.tsx`
- Modify: `app/blog/page.tsx`

- [ ] **Step 5.1: 홈 LCP 후보 확인**

```bash
node -e "
const r = require('./.lighthouse-results/home-mobile.json');
const a = r.audits['largest-contentful-paint-element'];
if (a && a.details && a.details.items) {
  for (const item of a.details.items) {
    console.log('LCP element:', JSON.stringify(item, null, 2));
  }
}
"
```

LCP element 가:
- Hero `<h1>` 텍스트 → 폰트 preload (Task 3) 로 이미 효과
- 이미지 (예: RegionMap SVG) → priority 추가 필요
- 외부 이미지 → next/image 변환 + priority

- [ ] **Step 5.2: RegionMap 이 image 사용한다면 priority 추가**

`components/region-map.tsx` 읽고 `<Image>` 또는 `<img>` 첫 번째에 `priority` + `fetchPriority="high"` 추가.

`<Image src="..." alt="..." />` →
`<Image src="..." alt="..." priority fetchPriority="high" />`

`<img>` (raw HTML) →
`<img src="..." alt="..." fetchPriority="high" loading="eager" />`

- [ ] **Step 5.3: 4페이지 첫 카드 priority**

각 페이지 (`app/welfare/page.tsx`, `app/loan/page.tsx`, `app/news/page.tsx`, `app/blog/page.tsx`) 의 첫 카드 그리드 안의 첫 번째 카드에 `priority` 전달.

전략: 각 카드 컴포넌트 (WelfareCard, LoanCard, NewsCard, BlogCard) 가 `priority?: boolean` prop 받도록 하고, 페이지에서 `index === 0 && priority` 조건으로 첫 카드만 priority 활성화.

**예시 — `app/blog/page.tsx`**:

```tsx
{posts.map((post, idx) => (
  <BlogCard key={post.slug} post={post} priority={idx === 0} />
))}
```

`components/blog-card.tsx` 의 image 부분:

```tsx
<Image
  src={post.cover_image || "/blog-default.png"}
  alt={post.title}
  width={...}
  height={...}
  priority={priority}
  fetchPriority={priority ? "high" : "auto"}
/>
```

각 카드 컴포넌트 4개 (Welfare/Loan/News/Blog) 동일 패턴.

- [ ] **Step 5.4: 빌드 검증**

```bash
bun run build 2>&1 | tail -20
```

- [ ] **Step 5.5: 시각 검증**

홈/welfare/loan/news/blog 5페이지 chrome 스크린샷 비교. 시각 변경 0.

- [ ] **Step 5.6: 커밋**

```bash
git add app/page.tsx components/region-map.tsx app/welfare/page.tsx app/loan/page.tsx app/news/page.tsx app/blog/page.tsx components/blog-card.tsx components/news-card.tsx
git commit -m "perf(image): LCP 후보 이미지 priority + fetchPriority high (5 페이지)"
```

- [ ] **Step 5.7: lighthouse 재측정**

예상 누적 효과 (Task 2~5):
- 홈: 33 → 70+
- 4페이지: 77~80 → 85~90+
- LCP 모든 페이지: 4s 이하

---

## Task 6: 검증 + 비교 스크립트

**Files:**
- Create: `scripts/lighthouse-compare.mjs`

- [ ] **Step 6.1: `scripts/` 폴더 존재 확인**

```bash
ls scripts/ 2>&1
```

없으면 `mkdir -p scripts`.

- [ ] **Step 6.2: 비교 스크립트 작성**

`scripts/lighthouse-compare.mjs`:

```javascript
#!/usr/bin/env node
// Phase 1 Core Web Vitals — before/after 점수 비교
// 사용: node scripts/lighthouse-compare.mjs
// 전제: .lighthouse-results-baseline/{page}-mobile.json (before)
//       .lighthouse-results/{page}-mobile.json (after)

import fs from "fs";

const PAGES = ["home", "welfare", "loan", "news", "blog"];
const BASE = ".lighthouse-results-baseline";
const AFTER = ".lighthouse-results";

function load(dir, page) {
  const path = `${dir}/${page}-mobile.json`;
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function metrics(report) {
  if (!report) return null;
  const a = report.audits;
  return {
    score: Math.round(report.categories.performance.score * 100),
    lcp: a["largest-contentful-paint"].displayValue,
    cls: a["cumulative-layout-shift"].displayValue,
    tbt: a["total-blocking-time"].displayValue,
    fcp: a["first-contentful-paint"].displayValue,
    si: a["speed-index"].displayValue,
  };
}

console.log("\n## Phase 1 — lighthouse before / after\n");
console.log("| 페이지 | 점수 (before → after) | LCP | TBT | CLS |");
console.log("|---|---|---|---|---|");

for (const p of PAGES) {
  const b = metrics(load(BASE, p));
  const a = metrics(load(AFTER, p));
  if (!b || !a) {
    console.log(`| ${p} | (데이터 없음) | - | - | - |`);
    continue;
  }
  const delta = a.score - b.score;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "=";
  console.log(
    `| ${p} | ${b.score} → ${a.score} (${arrow}${Math.abs(delta)}) | ${b.lcp} → ${a.lcp} | ${b.tbt} → ${a.tbt} | ${b.cls} → ${a.cls} |`,
  );
}
console.log();
```

- [ ] **Step 6.3: 실행 가능 확인**

```bash
node scripts/lighthouse-compare.mjs
```

Expected: 5페이지 비교 표 출력. 베이스라인 점수와 현재 점수가 같아 보일 수 있음 (.lighthouse-results 가 마지막 측정만 보관) — 정상.

- [ ] **Step 6.4: 커밋 (스크립트만)**

```bash
git add scripts/lighthouse-compare.mjs
git commit -m "chore(perf): Phase 1 lighthouse before/after 비교 스크립트"
```

- [ ] **Step 6.5: 최종 lighthouse 측정 + 비교 표 메모리 갱신**

prod 배포 완료 (Task 5 push 후 ~2분) 후 5페이지 측정:

```bash
for p in home welfare loan news blog; do
  url="https://www.keepioo.com"
  [ "$p" != "home" ] && url="$url/$p"
  npx -y lighthouse@latest "$url" \
    --output=json --output-path=".lighthouse-results/$p-mobile.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance --quiet
done
node scripts/lighthouse-compare.mjs
```

결과를 `~/.claude/projects/.../memory/project_keepioo_status.md` 또는 `project_keepioo_next_steps.md` 에 갱신.

성공 기준 (spec 7번 항목) 모두 충족 시 Phase 1 완료 보고.

---

## Task 7: 회귀 검증 (시각 + 기능)

**Files:** 없음 (chrome 자동화 또는 사장님 수동)

- [ ] **Step 7.1: 홈 시각 회귀 검증**

chrome 또는 사장님 직접:
- 홈 접속 → Hero 즉시 노출
- 스크롤 → HeroStats / RegionMap / Calendar / Alert / Blog / News / Feature / CTA 순차 노출 (placeholder 깜빡임 OK, 컴포넌트 사라짐 NG)
- 우측 하단 ChatbotPanel 1~2초 후 노출
- 좌측 하단 FloatingWishWidget 1~2초 후 노출

NG 발생 시:
- ChatbotPanel 미노출 → console.error 확인 후 dynamic import 경로 검증
- placeholder 후 빈 화면 → Suspense fallback 안의 server component fetch 에러 → 서버 로그

- [ ] **Step 7.2: 4페이지 시각 회귀 검증**

- /welfare /loan /news /blog 각 접속 → 카드 그리드 정상 노출
- 첫 카드 이미지가 즉시 (priority) 로드되는지 network 탭 확인

- [ ] **Step 7.3: AdSense 광고 노출 확인**

- 5페이지 모두 → 스크롤 → 광고 슬롯 ("광고" placeholder 또는 실제 광고) 노출
- DevTools network 탭에서 `adsbygoogle.js` 가 lazyOnload 로 늦게 로드되는지 확인

문제 발생 시 즉시 `git revert HEAD` (해당 task 커밋만) 후 분석.

---

## Self-Review (plan 작성 후 자체 점검)

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 AdSense lazy | Task 2 | ✅ |
| Section 2 below-the-fold dynamic | Task 4 (4.A client + 4.B server) | ✅ |
| Section 3a 폰트 preload | Task 3 | ✅ |
| Section 3b LCP 이미지 priority | Task 5 | ✅ |
| Section 4 4페이지 마이너 | Task 5 (Step 5.3) | ✅ |
| Section 5 검증·롤백 | Task 6, 7 | ✅ |
| `.gitignore` | Task 1 | ✅ |

빠짐 없음.

### 2. 회귀 가드

- 각 task 후 lighthouse 재측정 (Task 2.6, Task 3.7, Task 4.C, Task 5.7)
- 점수 회귀 시 즉시 `git revert HEAD`
- 시각 회귀 검증 (Task 7)

### 3. Type 일관성

- `dynamic` import 패턴 모든 사용처 동일 (`{ default: m.X }` 형식)
- `priority` prop 4 카드 컴포넌트 동일 시그니처 (`priority?: boolean`)

### 4. 위험 요소

- AdSense `lazyOnload` 가 매우 늦게 로드돼 광고 매출 영향 → Task 7.3 에서 확인. 실제 광고 표시 체감이 너무 늦으면 후속에서 IntersectionObserver root margin 조정
- Suspense placeholder 높이 미스매치 → Task 4.B.4 에서 시각 검증, 실측치로 갱신
- 폰트 swap 깜빡임 → Task 3.5 에서 확인, 거슬리면 후속 phase 에서 next/font/local self-host

---

## 진행 후 보고 사항 (사장님 통보)

각 task 완료 후 다음 형식으로 보고:

```
✅ Task N 완료
- 변경: <파일 N개>
- 커밋: <hash> "메시지"
- 측정 결과 (전→후): 홈 점수 33 → XX (▲YY)
- 회귀: 없음 / 있음 (상세)
- 다음 task 진행 의견 받기
```

전체 완료 시:
```
✅ Phase 1 완료
- 커밋 N개 푸시 완료
- 점수 비교 표 (before/after)
- 메모리 갱신: project_keepioo_status.md
- 다음 phase 추천: 2 (UX — 다크모드)
```
