# Phase 4 — 수익화 묶음 설계 (AdSense 자동 광고 + 결제 funnel + /admin 가시화)

**작성일**: 2026-04-28
**대상**: keepioo.com 수익화 3 영역 한 묶음
**범위**: A AdSense 자동 광고 (~10분) + B 결제·구독 funnel 이벤트 (~30분) + C /admin funnel 카드 (~1h) = **~1.5h**

---

## 1. 동기

사이트 업그레이드 6 phase 중 Phase 4. 사장님 결정 D — A·B·C 모두 묶음.

현재 상태 파악:
- AdSense ads.txt 검수 대기 중 (실제 광고 미표시), 라이브러리만 lazy load 완료 (Phase 1.1)
- 토스 라이브 결제 미활성 (테스트 단계)
- 활성 7d 3명, 가입 0건 → 매출 작업 ROI 가 트래픽 의존

→ Phase 4 의 진짜 가치는 **외부 (AdSense·토스) 풀린 시점에 즉시 매출 시작 + 측정 가능한 코드 인프라 준비**.

---

## 2. Section 1 — AdSense 자동 광고 도입 (A)

### 2.1 현재 베이스라인
- `components/adsense-lazy-loader.tsx` 가 사용자 첫 상호작용 시 `adsbygoogle.js` 동적 로드
- `components/ad-slot.tsx` 가 `<div>광고</div>` placeholder (수동 슬롯 자리)
- 환경변수 `NEXT_PUBLIC_ADSENSE_ID` 가 prod 에 설정됨

### 2.2 변경

**`components/adsense-lazy-loader.tsx`** — script load 후 자동 광고 활성 코드 추가:

```tsx
// 기존 동적 script 추가 후
s.onload = () => {
  // 자동 광고 (Auto Ads) — Google 이 페이지 빈 공간에 자동 광고 삽입.
  // AdSense 콘솔에서 자동 광고 ON 후 효과 시작. 미승인 사이트는 광고 안 채워짐.
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({
      google_ad_client: ADSENSE_ID,
      enable_page_level_ads: true,
    });
  } catch {
    /* 자동 광고 활성 실패 — 무시 (수동 슬롯이 남아있음) */
  }
};
```

**사장님 액션 (1번)**:
- AdSense 콘솔 → 자동 광고 → ON
- 광고 형식 선택 (가능한 모든 형식 default) + 광고 부하 (보통)

**기존 코드 보존**:
- `ad-slot.tsx` placeholder 그대로 — 수동 슬롯 향후 추가 시점에 재사용
- welfare/loan/news 의 AdSlot 사용처 그대로

### 2.3 효과
- AdSense 승인 즉시 페이지 곳곳에 자동 광고 삽입 (Google AI 가 위치 결정)
- 광고 단가는 자동 광고가 일반적으로 수동 슬롯보다 약간 낮지만, 디자인 통제 작업 0
- 향후 매출 효과 보고 수동 슬롯 추가는 별도 phase

### 2.4 회귀 위험
- 자동 광고 활성 코드가 lighthouse TBT 영향 가능 — 이미 lazy loader 안이라 크지 않음 (사용자 첫 상호작용 후 로드)
- 자동 광고가 모바일에서 sticky 광고로 화면 일부 가림 — 사장님이 콘솔에서 모바일 광고 형식 조정 가능

---

## 3. Section 2 — 결제·구독 funnel 이벤트 보강 (B)

### 3.1 현재 EVENTS 누락

기존: PRICING_VIEWED·CHECKOUT_STARTED 만. 결제 결과·구독 활성·취소 측정 불가.

### 3.2 변경

**`lib/analytics.ts`** — 5 신규 이벤트:

```ts
// 결제·구독 funnel (2026-04-28 Phase 4)
PRICING_PLAN_SELECTED: "pricing_plan_selected",  // 가격표 특정 플랜 클릭 (plan 파라미터)
CHECKOUT_COMPLETED: "checkout_completed",         // 토스 결제 성공 (success 페이지)
CHECKOUT_FAILED: "checkout_failed",               // 토스 결제 실패 (reason 파라미터)
SUBSCRIPTION_ACTIVE: "subscription_active",       // 빌링키 저장 + 첫 청구 성공
SUBSCRIPTION_CANCELLED: "subscription_cancelled", // 사용자 취소
```

### 3.3 trackEvent 호출 추가

**`app/pricing/page.tsx`**:
- 각 플랜의 "구독하기" 버튼 onClick 에 `trackEvent(EVENTS.PRICING_PLAN_SELECTED, { plan: 'basic'|'pro' })` 추가
- 페이지 진입 시 PRICING_VIEWED 이미 발사 중 (기존 보존)

**`app/checkout/success/page.tsx`**:
- mount 시 `trackEvent(EVENTS.CHECKOUT_COMPLETED, { ... })` + `trackEvent(EVENTS.SUBSCRIPTION_ACTIVE, { ... })`
- 빌링키 저장 후 첫 청구는 비동기 — SUBSCRIPTION_ACTIVE 는 success 페이지 도달 자체로 가정 (정밀 측정은 GA4 콘솔에서 별도 funnel 단계로 분리)

**`app/checkout/fail/page.tsx`**:
- mount 시 `trackEvent(EVENTS.CHECKOUT_FAILED, { reason })` (URL 쿼리의 errorMessage)

**구독 취소 server action**:
- 어디서 취소 처리되는지 확인 (mypage/billing 또는 별도 action) → `trackEvent(EVENTS.SUBSCRIPTION_CANCELLED)` 추가
- server action 은 client tracker 호출 불가 → client component 에서 호출 (취소 버튼 onClick) 또는 server action 응답 후 client 에서 fire

### 3.4 효과
- 사장님이 GA4 콘솔에서 결제 funnel 단계별 전환율 확인 가능 (PRICING_VIEWED → PLAN_SELECTED → CHECKOUT_STARTED → CHECKOUT_COMPLETED)
- 결제 실패 reason 별 분석 (카드 거부·환불·기타)

---

## 4. Section 3 — /admin funnel 카드 (C)

### 4.1 위치
- `/admin/insights` 의 신규 섹션 (메인 KPI 카드 후)

### 4.2 funnel 3종 (DB 기반, 24h)

**가입 funnel** (모두 supabase count, created_at 24h):

| 단계 | 쿼리 | 의미 |
|---|---|---|
| 1. 가입 완료 | `auth.users` count(created_at >= 24h ago) | 24h 신규 회원 |
| 2. 온보딩 완료 | `user_profiles` join `users` count(profile.created_at >= 24h ago AND age_group IS NOT NULL) | 프로필 채운 신규 |
| 3. 자동 알림 활성 | `user_alert_rules` count(created_at >= 24h ago AND is_active = true) | 알림 등록한 신규 |
| 4. 활성 구독 | `subscriptions` count(created_at >= 24h ago AND status = 'active') | 결제까지 간 신규 |

**진단 funnel**:
- GA4 데이터 fetch 는 Google Analytics Data API 필요 (작업량 큼) → **이번 phase 에서 GA4 fetch 안 함**.
- 대신 DB 기반: `quiz_prefill_applied` 가 onboarding 에서 발생하는데 이는 client tracker 라 DB 기록 X
- → 진단 funnel 은 **현재 DB 데이터로 측정 불가**. GA4 콘솔에서 사장님이 직접 확인.
- /admin funnel 카드는 **가입·구독 funnel 만**

**구독 funnel** (subscriptions 테이블 기반):

| 단계 | 쿼리 |
|---|---|
| 1. 신규 구독 시도 | subscriptions count(created_at >= 24h) |
| 2. 활성 구독 | subscriptions count(status = 'active') |
| 3. 취소 | subscriptions count(cancelled_at >= 24h) |

### 4.3 UI 디자인

**가입 funnel 카드**:

```
[ 가입 funnel — 24h ]
가입 완료    ████████████  12명
온보딩 완료  ████████      8명 (67%)
알림 활성    █████         5명 (42%)
구독 시작    ██            2명 (17%)
```

각 단계는 가로 progress bar (max = 1단계 카운트). 전환율 % 옆에 표시.

**구독 funnel 카드** (간단):

```
[ 구독 funnel — 24h ]
신규 시도    3
활성        12 (전체)
취소        1
```

### 4.4 변경 파일

- `lib/admin-funnel.ts` (신규) — server-side count 쿼리 4 + 3 함수
- `app/admin/insights/page.tsx` — 신규 섹션 추가 (FunnelCards 컴포넌트)
- `components/admin/funnel-cards.tsx` (신규) — UI 컴포넌트

---

## 5. 검증·롤백

### 검증
- typecheck/build 통과
- /admin/insights chrome 검증 — funnel 카드 정상 노출
- AdSense 자동 광고: 사장님 콘솔 ON 후 keepioo.com 접속해서 광고 표시 확인 (승인 후만, 외부 시간)
- 결제 이벤트: chrome devtools network 탭에서 gtag 호출 확인 (또는 GA4 Realtime)

### 회귀 trigger (즉시 revert)
- /admin/insights 가 funnel 쿼리 실패로 500 에러
- AdSense 자동 광고가 페이지 layout 깨짐 (모바일 sticky 광고가 ChatbotPanel 가림 등)
- lighthouse 점수 -10 이상 회귀

---

## 6. 의존성·리스크

### 의존성
- 토스 결제 라이브 활성 (결제 funnel 측정 가치는 라이브 결제 후)
- AdSense ads.txt 검수 통과 (자동 광고 가치는 승인 후)
- GA4 데이터는 콘솔 — funnel 단계별 분석은 사장님이 GA4 funnel 정의 (별도 콘솔 작업)

### 리스크

| 리스크 | 완화책 |
|---|---|
| AdSense 자동 광고가 모바일 sticky 광고로 ChatbotPanel·FloatingWishWidget 가림 | 사장님 콘솔에서 모바일 광고 형식 조정 (sticky off 등) |
| /admin funnel 쿼리가 무거움 (count(*) on auth.users) | 쿼리 timeout 5초 + try/catch fallback |
| auth.users 가 RLS 로 막힘 | admin client (service role) 사용 — 기존 admin 페이지 패턴 |
| 결제 이벤트 client tracker 호출이 success/fail 페이지 mount 전 fire 안 됨 | Suspense fallback 안 + useEffect mount 시 호출 |

### 외부 대기 (사장님 액션)
- AdSense 콘솔에서 자동 광고 ON
- 토스 라이브 결제 활성 (가맹점 심사 통과 후)
- GA4 콘솔에서 funnel 정의 (가입·구독·진단)

---

## 7. 성공 기준

- ✅ AdSense 자동 광고 코드 적용 (사장님 콘솔 ON 시 광고 표시)
- ✅ 5 신규 결제·구독 이벤트 코드 박힘
- ✅ /admin/insights 에 가입 funnel 카드 + 구독 funnel 카드 노출
- ✅ chrome console 에러 0
- ✅ lighthouse 회귀 -5 이내

위 5개 모두 충족 시 Phase 4 완료. 단 외부 대기 (AdSense 승인·토스 라이브) 풀려야 매출 효과 시작.
