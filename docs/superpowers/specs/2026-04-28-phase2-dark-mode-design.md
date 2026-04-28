# Phase 2 — 다크모드 토글 설계 (B 패키지)

**작성일**: 2026-04-28
**대상**: keepioo.com 핵심 사용자 동선 (홈·4페이지·Nav·Footer)
**범위**: 사용자 100% 가 보는 영역만 다크 매핑. admin·mypage·auth 는 라이트 유지

---

## 1. 동기

사이트 업그레이드 6 phase 중 Phase 2 (UX-1). 사용자 야간 사용 만족도·모던 사이트 인상 + 사장님 본인 어두운 환경 사용 가치.

ROI 우려:
- 사용자 요청 0건 (활성 7d 3명, 데이터 자체 부족)
- 한국 핀테크 표준 (토스) 다크모드 미지원
- 영구 유지비용 (신규 컴포넌트마다 dark variant 필요)

→ 사장님 결정 진행. 단 **B 패키지 (~25 파일) 로 범위 한정**해서 작업량/유지비 최소화.

---

## 2. 동작 패턴 — A (OS 자동 + 사용자 토글)

| 시나리오 | 동작 |
|---|---|
| 첫 방문 (localStorage 'theme' 없음) | OS `prefers-color-scheme` 따라감 (라이트/다크) |
| 사용자 토글 누름 | localStorage 'theme' = 'light' or 'dark' 저장 → 이후 시스템 변경 무시 |
| 토글 누른 사용자 재방문 | 저장된 값 적용 |
| 다시 시스템 자동으로 복원 | mypage 설정 또는 브라우저 localStorage 삭제 (단순화 위해 별도 UI 안 만듦) |

3-way cycle (라이트/다크/시스템) 은 사용자 혼란 위험. 2-way 명시 토글 + 시스템 자동 default 가 표준.

---

## 3. 색 팔레트 — 토스 풍 cool dark

| CSS 변수 | 라이트 (`:root`) | 다크 (`.dark`) | 의미 |
|---|---|---|---|
| `--bg-base` | `#FFFFFF` | `#16191E` (grey-950 신설) | body 배경 |
| `--bg-section-1` | `#F9FAFB` (grey-50) | `#1F242C` (grey-850 신설) | grey-50 띠 영역 |
| `--bg-section-2` | `#F2F4F6` (grey-100) | `#252A33` (grey-800 신설) | grey-100 띠 영역 |
| `--bg-card` | `#FFFFFF` | `#252A33` | 카드 흰 배경 |
| `--bg-elevated` | `#FFFFFF` | `#2D333D` | 떠있는 카드 (chatbot 등) |
| `--text-primary` | `#191F28` (grey-900) | `#F9FAFB` (grey-50) | 본문 잉크 |
| `--text-secondary` | `#4E5968` (grey-700) | `#B0B8C1` (grey-400) | 보조 텍스트 |
| `--text-tertiary` | `#6B7684` (grey-600) | `#8B95A1` (grey-500) | 메타·안내 |
| `--border` | `#E5E8EB` (grey-200) | `#333D4B` (grey-800) | 카드 테두리·구분선 |
| `--border-strong` | `#D1D6DB` (grey-300) | `#4E5968` (grey-700) | 강조 테두리 |
| `--blue-cta` | `#3182F6` (blue-500) | `#4593FC` (blue-400) | 메인 CTA (다크에서 약간 밝게) |

**전략**:
- `globals.css` 의 `:root` (라이트 default) + `.dark` 에서 위 변수 정의
- 본문 `body { background: var(--bg-base); color: var(--text-primary); }`
- 컴포넌트 코드: 기존 `bg-white` `text-grey-900` 등 hardcoded 클래스를 새 의미 단위 (`bg-app` `text-app` 등) Tailwind plugin 클래스로 변환

**Tailwind v4 통합**: `@theme` block 으로 의미 단위 색을 정의하면 Tailwind utility (`bg-app`·`text-app`) 자동 생성. 이 패턴이 가장 깔끔.

```css
/* globals.css */
:root {
  --color-app: #FFFFFF;
  --color-app-section: #F9FAFB;
  --color-app-card: #FFFFFF;
  --color-app-text: #191F28;
  --color-app-text-secondary: #4E5968;
  --color-app-border: #E5E8EB;
}
.dark {
  --color-app: #16191E;
  --color-app-section: #1F242C;
  --color-app-card: #252A33;
  --color-app-text: #F9FAFB;
  --color-app-text-secondary: #B0B8C1;
  --color-app-border: #333D4B;
}
@theme inline {
  --color-app: var(--color-app);
  --color-app-section: var(--color-app-section);
  /* ... */
}
```

이렇게 하면 `bg-app`·`text-app`·`border-app` 등 Tailwind 클래스 자동 사용 가능.

---

## 4. 토글 컴포넌트

**파일**: `components/theme-toggle.tsx` (신규, client component, ~50라인)

**위치**: `components/nav.tsx` 의 종(NotificationBell) 아이콘 왼쪽

**디자인**:
- 44×44px 터치 타겟 (WCAG AAA)
- 라이트 모드일 때 → 달 아이콘 (다음에 누르면 다크) 표시
- 다크 모드일 때 → 해 아이콘 (다음에 누르면 라이트) 표시
- aria-label: "어두운 모드로 전환" / "밝은 모드로 전환"

**상태 관리**:
- 첫 mount 시 `<html>` 의 `dark` 클래스 유무로 초기 상태 판단 (FOUC script 가 미리 설정함)
- 토글 클릭: `<html>.classList.toggle('dark')` + `localStorage.setItem('theme', dark ? 'dark' : 'light')`
- 시스템 변경 listener — `localStorage.theme` 가 명시 저장된 후엔 무시

```tsx
"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "밝은 모드로 전환" : "어두운 모드로 전환"}
      className="inline-flex items-center justify-center w-11 h-11 rounded-full hover:bg-app-section transition-colors"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

---

## 5. FOUC (깜빡임) 방지

**파일**: `app/layout.tsx` 의 `<head>` 안 (Pretendard preload link 직후)

```html
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`
  }}
/>
```

- React hydration 전 동기 실행 → 첫 paint 부터 다크 적용
- try/catch — Safari private mode 등 localStorage 차단 시 안전 fallback (라이트로 표시)

---

## 6. 적용 범위 (B — 25 파일 예상)

### 6.1 인프라 (4 파일)
- `app/layout.tsx` — FOUC script + Nav 가드
- `app/globals.css` — `:root` / `.dark` CSS 변수 + `@theme inline`
- `components/theme-toggle.tsx` (신규)
- `components/nav.tsx` — ThemeToggle 추가 + 자체 색 적용

### 6.2 페이지 (5 파일)
- `app/page.tsx` (홈) — Hero blob, 섹션 bg, 텍스트 색
- `app/welfare/page.tsx`
- `app/loan/page.tsx`
- `app/news/page.tsx`
- `app/blog/page.tsx`

### 6.3 컴포넌트 (~16 파일)
- `components/footer.tsx`
- `components/blog-card.tsx`, `news-card.tsx`
- `components/home-target-cards.tsx`, `home-popular-picks.tsx`, `home-value-props.tsx`
- `components/home-recommend-card.tsx`, `home-recommend-auto.tsx`
- `components/feature-grid.tsx`, `home-cta.tsx`
- `components/region-map.tsx`, `hero-stats.tsx`
- `components/calendar-preview.tsx`, `alert-strip.tsx`
- `components/chatbot-panel.tsx`, `wish-form-floating.tsx`
- `components/reconsent-banner.tsx`, `search-box.tsx`
- `components/personalization/EmptyProfilePrompt.tsx`, `EnhanceProfileBanner.tsx`

### 6.4 미적용 (라이트 유지)
- `app/admin/**` — 사장님 전용
- `app/mypage/**` — 후속 phase 에서 추가 가능
- `app/login`, `signup`, `forgot-password`, `reset-password` — 폼 스타일 복잡, 후속
- `app/checkout/**`, `app/pricing` — 결제 동선, 위험 분리
- `app/calendar`, `eligibility/**` 등 long-tail SEO 페이지 — 후속

→ 적용 페이지에 **route group `(public)/`** 같은 구조 변경은 **하지 않음**. 단순히 각 페이지 파일에 dark 클래스 추가.

---

## 7. 검증 + 회귀 가드

### 검증 절차
1. 토글 동작 — 라이트 → 다크 → 라이트 (각 새로고침 후 유지)
2. FOUC 0 — 새로고침 시 깜빡임 없음 (chrome devtools network slow 3G 로 확인)
3. WCAG AA 대비 — `--text-primary` on `--bg-base` 검증 (4.5:1 이상)
4. chrome 자동 검증 5페이지 × 라이트/다크 (총 10 스크린샷)
5. lighthouse 재측정 — 다크모드 추가로 FOUC script + ThemeToggle JS 가 메인스레드 영향 없는지

### 회귀 trigger (즉시 revert)
- FOUC 발생 (라이트→다크 깜빡임)
- 다크모드에서 텍스트 안 보이는 곳 (대비 부족)
- admin/mypage/auth 가 의도치 않게 다크로 변함
- lighthouse 점수 -10 이상 회귀

### 시각 회귀 검증
playwright 로 5페이지 × 2 모드 = 10 스크린샷. 사장님 chrome 검증 추가.

---

## 8. 의존성·리스크

### 의존성
- 없음 — 기존 Tailwind v4 + globals.css 사용

### 리스크

| 리스크 | 완화책 |
|---|---|
| AdSense 광고가 다크 페이지에서 어색 | 광고는 항상 라이트 디자인 — `<div data-no-dark>` 같은 wrapper 로 광고 영역만 라이트 강제 (Phase 2 이후 검토) |
| RegionMap SVG 색이 다크에서 안 보임 | SVG fill 을 CSS 변수로 추상화 |
| Hero blob gradient 다크에서 어색 | 다크용 gradient 별도 정의 |
| 첫 페이지 로드 시 React hydration 중 토글 깜빡임 | FOUC inline script 로 해결 |
| 색 변경 후 일부 페이지에 dark variant 누락 | playwright 5페이지 × 2 모드 검증으로 발견 |
| 영구 유지비용 (신규 컴포넌트마다 dark 추가) | CSS 변수 패턴 (`bg-app`·`text-app`) 으로 자동 적용 → 신규 컴포넌트도 변수만 쓰면 자동 다크 |

---

## 9. 성공 기준

- ✅ 토글 동작 (라이트/다크 cycle + 새로고침 유지)
- ✅ FOUC 0 (시각 깜빡임 없음)
- ✅ 5페이지 × 2 모드 (10 스크린샷) 시각 회귀 0
- ✅ admin/mypage/auth 라이트 그대로 (다크 누락 0)
- ✅ lighthouse 점수 회귀 < 5점 (이상적: 0)
- ✅ WCAG AA 대비 (4.5:1) 모든 텍스트 통과

위 6개 모두 충족 시 Phase 2 완료.
