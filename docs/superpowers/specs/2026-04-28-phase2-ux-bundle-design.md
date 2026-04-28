# Phase 2 — UX 핵심 묶음 설계 (모바일 가독성 + 검색 UX + 온보딩 축소)

**작성일**: 2026-04-28
**대상**: keepioo.com 사용자 체감 직결 3개 영역
**범위**: c (가독성, ~1h) + d (검색, ~30분) + e (온보딩, ~1.5h) = **총 ~3h**

---

## 1. 동기

사이트 업그레이드 6 phase 중 Phase 2 의 다크모드를 보류하고, ROI 높은 UX 작업 3개로 변경:

- **다크모드 보류 이유**: 사용자 요청 0건, 토스 표준 미지원, 영구 유지비용
- **c+d+e 선택 이유**: 모두 즉시 사용자 체감 직결 + 작업량 균형 + 한 spec/plan 에 묶기 적정 규모

---

## 2. Section 1 — 모바일 가독성 정밀화 (c)

### 2.1 현재 베이스라인
- 본문 13px (커밋 8d00a51, 12→13 승격 완료)
- 카드 padding 16px
- 메타 텍스트 12px
- line-height 1.5 (globals.css body)

### 2.2 목표
노년·시력 약한 사용자 의식. **모바일에서만** 크기 증가 (데스크톱은 그대로 — 1280px+ 에서 15px 본문은 어색).

### 2.3 변경

| 영역 | 현재 | 변경 | Tailwind 패턴 |
|---|---|---|---|
| 카드 본문 (13px) | `text-[13px]` | 모바일 15px / 데스크톱 13px | `text-[13px] md:text-[13px] max-md:text-[15px]` 또는 `text-[15px] md:text-[13px]` |
| 카드 본문 (14px 일부) | `text-sm` (14px) | 모바일 15px / 데스크톱 14px | `text-[14px] max-md:text-[15px]` |
| 메타 텍스트 (12px) | `text-xs` (12px) | 모바일 13px / 데스크톱 12px | `text-xs max-md:text-[13px]` |
| 카드 padding | `p-4` (16px) | 모바일 20px / 데스크톱 16px | `p-4 max-md:p-5` |
| 본문 line-height (모바일) | `leading-[1.5]` | 모바일 1.65 / 데스크톱 1.5 | `leading-[1.5] max-md:leading-[1.65]` |

### 2.4 대상 파일 (~10)
- `components/blog-card.tsx`
- `components/news-card.tsx`
- `components/alert-strip.tsx`
- `components/feature-grid.tsx`
- `components/home-cta.tsx`
- `components/home-recommend-card.tsx`
- `components/home-recommend-auto.tsx`
- `app/welfare/page.tsx` (카드 인라인)
- `app/loan/page.tsx` (카드 인라인)
- `app/news/page.tsx` (카드 인라인)
- `app/blog/page.tsx` (카드 인라인)

### 2.5 검증
- chrome 모바일 (390×844) 5페이지 스크린샷 — 본문 가독성 향상 시각 확인
- chrome 데스크톱 (1280×800) — 회귀 0 (데스크톱 변화 없어야 함)

---

## 3. Section 2 — 검색 UX (d, 최근 검색만)

### 3.1 이미 있음 (변경 없음)
`components/search-box.tsx` 검토 결과 — d 의 자동완성·debounce·키보드 네비·placeholder 회전·키워드 칩 모두 구현됨. 메모리 outdated.

### 3.2 추가 작업
**최근 검색 5건** localStorage 기반:

- 검색박스 focus 시 (query 비어있을 때) 드롭다운에 최근 검색 5건 노출
- 키워드 클릭 시 자동 검색 실행
- 각 항목 X 버튼으로 개별 삭제
- "전체 삭제" 링크
- localStorage 키: `keepioo:recent-searches` (JSON array, max 5, 가장 최근이 앞)
- 검색 실행 시 자동 추가 (중복 제거)

### 3.3 변경 파일
- `components/search-box.tsx` (1 파일, ~50라인 추가)

### 3.4 코드 스케치

```tsx
// 추가 import
import { useCallback } from "react";

const RECENT_KEY = "keepioo:recent-searches";
const MAX_RECENT = 5;

// helper
function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw).slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch {}
}
function pushRecent(query: string) {
  const list = loadRecent().filter((q) => q !== query);
  list.unshift(query);
  saveRecent(list);
}

// state
const [recent, setRecent] = useState<string[]>([]);
useEffect(() => { setRecent(loadRecent()); }, []);

// handleSearch 안에 pushRecent(query) 호출 추가

// 드롭다운 안: query 비어있고 focus 시 recent 노출
{showDropdown && !query && recent.length > 0 && (
  <div className="...">
    <div className="px-5 py-2 text-xs text-grey-500 flex items-center justify-between">
      <span>최근 검색</span>
      <button onClick={() => { saveRecent([]); setRecent([]); }}>전체 삭제</button>
    </div>
    {recent.map((q, i) => (
      <div key={q} className="flex items-center hover:bg-grey-50">
        <button onClick={() => handleSearch(q)} className="flex-1 ...">{q}</button>
        <button onClick={() => { const next = recent.filter(x => x !== q); saveRecent(next); setRecent(next); }} aria-label="삭제">×</button>
      </div>
    ))}
  </div>
)}
```

### 3.5 검증
- 검색 → 새로고침 → focus 시 최근 검색 노출 확인
- 6번째 검색 → 가장 오래된 것 빠짐 (max 5)
- X 버튼 → 개별 삭제, 전체 삭제 버튼 동작

---

## 4. Section 3 — 온보딩 5단계 → 3단계 (e)

### 4.1 현재 구조
`app/onboarding/steps/`:
- `step-age.tsx` — 연령대 (6 옵션)
- `step-region.tsx` — 지역 17 + district
- `step-occupation.tsx` — 직업 (5~6 옵션)
- `step-income.tsx` — 소득 (5 옵션)
- `step-interests.tsx` — 관심사 (9 옵션) + 가구상태 6

### 4.2 합치기 결정 — 옵션 A 채택

| 새 단계 | 기존 단계 통합 | 이유 |
|---|---|---|
| **1. 기본** | Age + Region (district 포함) | 필수 식정 정보, 지역은 별도 화면 가치 (district 선택 부담) |
| **2. 자격** | Occupation + Income | 자격 매칭 핵심 — 같은 화면에서 함께 |
| **3. 관심** | Interests + Household | 추천 시드 — 둘 다 multi-select 라 패턴 동일 |

대안 검토:
- **옵션 B** (Age+Region+Occupation / Income+Household / Interests) — 1단계 정보량 너무 큼 (지역 17 + district + 직업)
- **옵션 C** (5→2 더 줄임) — 폼 너무 길어져 모바일 스크롤 부담

→ **옵션 A 가 정보량 균형 + 화면 길이 적정**.

### 4.3 변경

**파일**:
- `app/onboarding/onboarding-flow.tsx` — TOTAL_STEPS 5→3, step 1~3 분기 재정의
- `app/onboarding/steps/step-basic.tsx` (신규) — Age + Region 통합
- `app/onboarding/steps/step-eligibility.tsx` (신규) — Occupation + Income 통합
- `app/onboarding/steps/step-interests.tsx` (수정) — Household 추가 (기존엔 Income 단계가 Household 했을 가능성 — 확인 필요)

또는 더 작은 변경: 기존 5 step 컴포넌트 유지 + onboarding-flow 에서 단계 묶기 (한 step 안에 2 컴포넌트 렌더):

```tsx
{step === 1 && (<><StepAge ... /><StepRegion ... /></>)}
{step === 2 && (<><StepOccupation ... /><StepIncome ... /></>)}
{step === 3 && (<StepInterests ... />)}
```

이 방식 추천 — 새 컴포넌트 안 만들고 onboarding-flow.tsx 1 파일만 수정.

### 4.4 시각·UX 고려
- 1단계 화면 안에 Age + Region 2 섹션 — 시각 위계 분명히 (소제목 + 구분선)
- 모바일 스크롤 — 한 화면 안에 2 섹션이 들어가도록 옵션 컴팩트
- 진행 표시줄: 5/5 → 3/3 (단계 ↓, 사용자 부담 ↓)

### 4.5 GA4 이벤트
기존 5단계별 이벤트가 있다면 → 3단계로 변경 (또는 step 번호 그대로 두되 의미 변경 표 메모리에 남김). 분석 funnel 깨짐 우려 → 새 이벤트 이름으로 (예: `ONBOARDING_STEP_BASIC_COMPLETED` `ONBOARDING_STEP_ELIGIBILITY_COMPLETED` `ONBOARDING_STEP_INTERESTS_COMPLETED`).

### 4.6 검증
- 신규 사용자 시뮬레이션 (chrome incognito) 또는 사장님 본인 온보딩 다시 하기 링크
- 3단계 모두 완주 → /mypage?onboarded=1 redirect
- 각 단계 skip/이전 버튼 동작
- 회귀: 기존 5단계 사용자 데이터 (user_profiles) 마이그레이션 불필요 (저장 데이터 형식 동일)

---

## 5. 검증 종합

### 5.1 시각 검증
- chrome 모바일 (390×844) 5 핵심 페이지 + 검색박스 focus + 온보딩 3단계 = 약 10 스크린샷
- chrome 데스크톱 (1280×800) — 가독성 회귀 0 확인

### 5.2 lighthouse 회귀 측정
Phase 1 베이스라인 (홈 83) 대비 -5점 이내 유지. 폰트 크기·padding 변경이 layout 미세 영향 가능.

### 5.3 회귀 trigger (즉시 revert)
- 데스크톱에서 본문이 너무 커보임 (의도와 다름)
- 온보딩 어떤 단계라도 동작 안 함
- 검색 자동완성이 깨짐 (recent 추가 코드 영향)
- lighthouse 점수 -10 이상

---

## 6. 진행 순서 (plan 후)

각 section 단독 커밋 → 검증 → 다음:

1. **Section 1 모바일 가독성** — 10 파일 일괄 변경 (Tailwind 패턴 변환), 1 커밋
2. **Section 2 최근 검색** — search-box.tsx 1 파일, 1 커밋
3. **Section 3 온보딩 합치기** — onboarding-flow.tsx 수정, 1 커밋

총 3 커밋 + 메모리 갱신.

---

## 7. 의존성·리스크

### 의존성
- 없음 — 기존 Tailwind, localStorage, server action 사용

### 리스크

| 리스크 | 완화책 |
|---|---|
| 데스크톱에서 본문 너무 커짐 | `max-md:` prefix 로 모바일만 적용 — 데스크톱 0 변경 |
| 폰트 크기 변경으로 카드 높이 바뀌어 CLS 회귀 | placeholder 의 의미가 없는 곳이라 영향 미미. lighthouse 재측정으로 확인 |
| localStorage 차단 사용자 (Safari private) | try/catch 안전 fallback (기존 패턴과 동일) |
| 온보딩 3단계 내 화면 길이 부담 | 옵션 컴팩트 (radio 가로 배치, 작은 padding) |
| 기존 온보딩 GA4 funnel 분석 깨짐 | 새 이벤트 이름으로 분리 (이전 데이터 보존) |

---

## 8. 성공 기준

- ✅ 모바일에서 본문 가독성 시각 향상 (사장님 chrome 검증)
- ✅ 데스크톱 회귀 0
- ✅ 검색박스 focus 시 최근 검색 5건 노출 (저장·삭제 동작)
- ✅ 온보딩 3단계로 완주 가능
- ✅ lighthouse 점수 회귀 -5점 이내
- ✅ chrome console 에러 0

위 6개 모두 충족 시 Phase 2 완료.
