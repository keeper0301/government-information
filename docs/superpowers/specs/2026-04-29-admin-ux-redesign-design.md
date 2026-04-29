# 어드민 UI/UX 재배치 설계 (2026-04-29)

## 배경

`/admin` 하위 페이지가 20개로 늘어나면서 메인 대시보드가 ActionCard 그리드만으로 모든 페이지를 노출하게 되어 가독성·우선순위·페이지 찾기 부담이 증가했다. 사장님 사고 보고: "전체적으로 기능이 많아 가독성이 안 좋고 정리가 안 되어 있다 — 전면 재배치 필요."

## 사장님 운영 우선순위 (brainstorm 결과)

1. **운영 상태 점검** — 사이트 잘 굴러가나? cron 실패·매출·헬스 한눈에
2. **컨텐츠 발행** — 오늘 새로 들어온 정책·뉴스 보고 등록
3. **지표 분석** — KPI · funnel · 분포 들여다보기

## 합의된 IA (정보 아키텍처)

### 사이드 메뉴 5 그룹 + 메인 대시보드

```
🏠 대시보드 (메인)

📊 1. 운영 상태  (5)
   · 헬스 대시보드        /admin/health
   · cron 수동 실행       /admin/cron-trigger
   · cron 실패 알림       /admin/cron-failures
   · 내 감사 로그         /admin/my-actions
   · 공고 detail 보강     /admin/enrich-detail

📝 2. 컨텐츠 발행  (6 + 1 상세)
   · 광역 보도자료 후보   /admin/press-ingest
   · 복지 정책 신규       /admin/welfare/new
   · 대출 정책 신규       /admin/loan/new
   · 뉴스 모더레이션      /admin/news
   · 뉴스 dedupe 백필     /admin/news/backfill-dedupe-runner
   · 블로그 목록          /admin/blog       (+ /admin/blog/[id] 상세)

📤 3. 알림 발송  (2)
   · 카카오톡 발송        /admin/alimtalk
   · 알림 시뮬레이터      /admin/alert-simulator

📈 4. 지표·분석  (3)
   · 사용자 funnel        /admin/insights
   · 본문 targeting 분석  /admin/targeting
   · 자영업자 자격 진단   /admin/business

👤 5. 사용자  (2)
   · 사용자 조회          /admin/users/[id]
   · 위시리스트           /admin/wishes
```

총 **20 페이지 + 메인 대시보드**. 그룹 순서 = 사장님 우선순위 그대로.

## 메인 대시보드 (`/admin`) — 4 섹션

기존 ActionCard 그리드 (관리 페이지 카드 15+) 제거 → 사이드 메뉴로 이전.
대시보드는 운영 상태 한눈에 보는 정보만 남긴다.

### 섹션 1: ⚠️ "지금 처리 필요" 배너 (조건부)

5개 신호 중 하나라도 true 면 빨간 alert 배너 표시. 모두 false 면 섹션 자체 hide.

| 신호 | 조건 | 출처 |
|---|---|---|
| cron 실패 알림 | `cron_failure_log.notified_at >= NOW()-24h` count ≥ 1 | 기존 |
| 광역 보도자료 후보 적체 | `getPressIngestKpi().candidates_24h ≥ 30` | 기존 |
| 만료 탈퇴 미처리 | `pending_deletions.scheduled_delete_at < NOW()` count ≥ 1 | 기존 |
| advisor security WARN 신규 | Supabase advisor lint level=WARN (메모리 캐시 24h) | 신규 |
| (확장 슬롯) | 추후 신호 추가 가능 | — |

배너 형태:
```
⚠️ 지금 처리 필요
cron 실패 1건 · 광역 후보 30건 · 만료 탈퇴 0건
```

각 신호는 클릭 가능한 chip — 해당 페이지로 이동.

### 섹션 2: 24h 운영 KPI 카드 4개

기존 8개 카드 → **4개로 축소** (사장님 1순위 운영점검 가독성 ↑):

1. **신규 가입** (auth.users) — 토스 톤 큰 숫자 32px
2. **활성 구독** (basic·pro)
3. **자동 등록** (admin_actions.auto_press_ingest)
4. **cron 실패** (cron_failure_log.notified_at) — ≥1 시 빨강 강조

기존 카드 (알림 발송·뉴스 수집·공고 수집·AI 상담) 는 각 그룹 페이지로 이동:
- 알림 발송 → /admin/alimtalk 의 자체 KPI
- 뉴스/공고 수집 → /admin/insights 또는 /admin/health
- AI 상담 → /admin/insights

### 섹션 3: 30일 추세 차트

가입·결제·발송 일별 시각화 (기존 `getDailySignups`/`getDailyRevenueEstimated` 재사용).

### 섹션 4: 최근 활동 (2 col)

좌: 최근 가입 5건 (auth.users 기준)
우: 최근 내 작업 5건 (admin_actions actor=me)

기존 코드 그대로 활용.

## 시각 디자인 (토스 TDS 톤)

기존 keepioo 본 사이트 톤과 100% 일관:

| 요소 | 값 |
|---|---|
| 메인 배경 | `#FFFFFF` |
| 사이드바 배경 | `#F7F8FA` (옅은 grey 50) |
| 사이드바 우 border | `1px solid #E5E8EB` |
| 잉크 (본문) | `#191F28` (cool grey 900) |
| 보조 텍스트 | `#4E5968` (grey 700) |
| 메뉴 아이템 텍스트 | `#4E5968` |
| 활성 메뉴 | `bg #EBF3FE` + `border-left 3px #3182F6` + `color #3182F6` + `font-weight 700` |
| hover | `bg #F2F4F6` |
| 그룹 헤더 | `color #8B95A1` + `text-[10px]` + `tracking 0.12em uppercase` |
| accent (블루) | `#3182F6` |
| 위험 (빨강) | `#E74C3C` 텍스트 + `#FFF5F5` 배경 + `#FCC` border |
| 카드 | `bg #F7F8FA` + `border 1px #E5E8EB` + `radius 12px` |
| 위험 카드 | `bg #FFF5F5` + `border 1px #FCC` + `radius 12px` |
| 폰트 | Pretendard Variable (기존) |

## 가독성 강화

| 요소 | 값 |
|---|---|
| 페이지 타이틀 | `26~32px / weight 800 / letter-spacing -0.04em` |
| 섹션 헤더 (UPPERCASE) | `13px / weight 700 / tracking 0.06em` |
| KPI 라벨 | `11px / weight 700 / tracking 0.08em / uppercase` |
| KPI 숫자 | `32px / weight 800 / letter-spacing -0.03em` |
| KPI 단위 (명·건) | `15px / weight 600 / color grey-600` |
| 본문 | `14~15px / line-height 1.6` |
| 메뉴 아이템 | `14px / line-height 1.5 / 12px y-padding` |
| 카드 padding | `18~22px` |
| 메인 영역 padding | `40px 48px` (desktop) → `18px 16px` (mobile) |
| 카드 gap | `14px` |

## 반응형 (3 break)

| break | 너비 | 사이드바 | 메인 padding | KPI 그리드 |
|---|---|---|---|---|
| Desktop | ≥ 1280px | 280px 풀텍스트 + 아이콘 | 40px 48px | 4 col |
| Tablet | 768~1279px | 200px 짧은 텍스트 | 24px 28px | 2 col |
| Mobile | < 768px | 햄버거 ☰ → 78% 슬라이드 인 + dim 오버레이 | 16px 14px | 2 col |

모바일 사이드바 동작:
- 좌상단 햄버거 (`☰`) 버튼 → 클릭 시 사이드바 슬라이드 인 (left → right)
- dim 오버레이 (`bg-black/40`) → 클릭 또는 버튼 다시 (`×`) 클릭 시 닫힘
- ESC 키로도 닫힘 (접근성)
- 메뉴 항목 클릭 → 자동 닫힘 + 페이지 이동

## 헤더 슬롯 통일

기존 각 admin 페이지마다 `<h1>` 스타일 제각각. layout 안에 표준 헤더 슬롯 도입:

```tsx
<div className="admin-page-header">
  <p className="kicker">ADMIN · {breadcrumb}</p>
  <h1 className="title">{pageTitle}</h1>
  <p className="subtitle">{pageDescription}</p>
</div>
```

각 sub page 는 metadata 또는 export 로 title/description 제공:

```tsx
export const adminPage = {
  group: "1. 운영 상태",
  title: "헬스 대시보드",
  description: "DB · cron · 사용자 · 환경변수 통합 모니터링",
};
```

## 작업 범위

### 신규 파일

- `app/admin/layout.tsx` — 사이드바 + 메인 영역 grid 레이아웃 (server component)
- `components/admin/sidebar.tsx` — 사이드바 메뉴 렌더링 (server component, 활성 메뉴 highlight 위해 usePathname 분리 필요 시 client wrapper)
- `components/admin/sidebar-mobile-toggle.tsx` — 모바일 햄버거 토글 (client component, useState)
- `components/admin/admin-page-header.tsx` — 표준 페이지 헤더 컴포넌트
- `lib/admin/menu.ts` — 메뉴 그룹·아이템 정의 (단일 source of truth)
- `lib/admin/dashboard-alerts.ts` — "지금 처리 필요" 신호 5종 fetch (병렬 Promise.all)

### 변경 파일

- `app/admin/page.tsx` — ActionCard 그리드 제거, 4 섹션 (alert·KPI 4·추세·최근활동) 만 남김
- 각 admin sub page — 가능한 헤더 슬롯으로 점진 마이그레이션 (선택, 본 spec 1차 범위 외)

### 변경 없음

- 모든 admin sub page 자체 (welfare/new, loan/new, press-ingest, news, health, insights 등) — 코드 0 수정. layout 이 자동 적용됨.
- 기존 server actions·DB 쿼리 — 모두 그대로 재사용.
- middleware 인증 — `/admin` prefix 그대로 적용.

## 회귀 분석

| 위험 | 평가 | 차단 |
|---|---|---|
| sub page 동작 변화 | **0** | layout 만 추가, page.tsx 자체 변경 0 |
| 인증·권한 | **0** | 기존 `requireAdmin()` 패턴 그대로, layout 안에서도 동일 |
| URL 구조 변화 | **0** | 모든 path 그대로, redirect 없음 |
| SEO | **0** | admin 은 `robots: { index: false }` 이미 설정 |
| 모바일 호환 | **낮음** | 햄버거 + 슬라이드는 client component (1개) 만 사용 |
| 빌드 시간 | **낮음** | layout.tsx 1개 + 컴포넌트 4~5개 추가 |

## 마이그레이션 단계 (한 번에)

1. `lib/admin/menu.ts` — 5 그룹 + 20 페이지 메타데이터 정의
2. `components/admin/sidebar.tsx` — 메뉴 렌더 (server component)
3. `components/admin/sidebar-mobile-toggle.tsx` — 햄버거 토글 (client)
4. `components/admin/admin-page-header.tsx` — 헤더 슬롯
5. `app/admin/layout.tsx` — grid 레이아웃 + 위 컴포넌트 조합
6. `lib/admin/dashboard-alerts.ts` — 5 신호 fetch
7. `app/admin/page.tsx` 슬림화 — ActionCard 그리드 제거, 4 섹션 유지
8. 타입 체크 + visual 검증 (각 admin 페이지 1번씩 chrome 자동화)

전체 1 PR / 8 commit 단위로 진행 가능.

## 후속 (본 spec 범위 외, 별도 plan)

1. **각 admin sub page 헤더 슬롯 마이그레이션** — sub page 의 `<h1>` 통일 (점진, 페이지마다 별 commit)
2. **사이드바 즐겨찾기 / pin** — 사장님이 자주 쓰는 페이지를 상단 고정 (사용 패턴 누적 후)
3. **검색 명령 팔레트 (Cmd+K)** — 페이지 빠른 이동 (페이지 30+ 늘어나면 가치)
4. **alert 배너 신호 확장** — 운영 패턴 보고 추가 (예: 24h 가입 0 / 결제 실패 / 발송 실패율 ≥10%)

## 검수 체크리스트

- [ ] 데스크탑 (1920px) 사이드바 풀텍스트 + 메인 4 섹션 정상
- [ ] 태블릿 (1024px) 사이드바 압축 + KPI 2 col
- [ ] 모바일 (390px) 햄버거 → 슬라이드 인 동작 + dim 오버레이 + ESC 닫기
- [ ] 모든 admin sub page (20개) 사이드바 적용 + sub page 자체 동작 회귀 0
- [ ] 활성 메뉴 highlight (현재 path 기준)
- [ ] alert 배너 5 신호 모두 0이면 hide / 1개 이상이면 show
- [ ] 키보드 접근성 — Tab 네비 + ESC 닫기 + focus ring (`#3182F6`)
- [ ] 다크모드 — keepioo 본 사이트가 아직 다크모드 미지원이므로 본 spec 도 라이트만

## 참고 (mockup)

`.superpowers/brainstorm/1102433-1777426086/content/` 에 brainstorm 단계 mockup 4개:
- `ia-options.html` — IA 3옵션 비교
- `sidebar-grouping.html` — 5 그룹 배치
- `sidebar-light.html` — 토스 톤 적용
- `readable-responsive.html` — 가독성 강화 + 반응형 3 break

## 관련 메모리

- `project_keepioo_status.md` — Phase 6 완료 상태 (admin 페이지 14 후보 → 10 push)
- `feedback_review_before_commit.md` — 자체 리뷰 후 단일 commit
- `user_role.md` — 비개발자 keepioo.com 운영자, 큰 단위 작업 선호
