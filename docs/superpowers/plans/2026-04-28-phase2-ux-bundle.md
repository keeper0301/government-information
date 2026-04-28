# Phase 2 — UX 핵심 묶음 (가독성·검색·온보딩) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 의 모바일 본문 가독성 향상 + 검색박스에 최근 검색 5건 + 온보딩 5단계→3단계 — 사용자 체감 직결 3개 영역 한 번에.

**Architecture:** Section 별 단독 커밋. (1) 모바일 가독성은 Tailwind `max-md:` 패턴으로 데스크톱 회귀 0. (2) 검색 최근 검색은 search-box.tsx 1 파일 ~50라인 추가. (3) 온보딩은 onboarding-flow.tsx 의 step 분기를 1단계 안에 2 컴포넌트 묶기.

**Tech Stack:** Next.js 16, Tailwind v4 (max-md prefix), localStorage, GA4 trackEvent

**Spec:** `docs/superpowers/specs/2026-04-28-phase2-ux-bundle-design.md`

---

## File Structure

| 파일 | 변경 종류 | 책임 |
|---|---|---|
| `components/blog-card.tsx` | modify | 카드 본문 모바일 15px |
| `components/news-card.tsx` | modify | 카드 본문 모바일 15px |
| `components/alert-strip.tsx` | modify | 마퀴 본문 모바일 15px |
| `components/feature-grid.tsx` | modify | 3 STEP 본문 모바일 15px |
| `components/home-cta.tsx` | modify | CTA 본문 모바일 15px |
| `components/home-recommend-card.tsx` | modify | 폼 본문 모바일 15px |
| `components/home-recommend-auto.tsx` | modify | 추천 카드 본문 모바일 15px |
| `app/welfare/page.tsx` | modify | 카드 본문 모바일 15px |
| `app/loan/page.tsx` | modify | 카드 본문 모바일 15px |
| `app/news/page.tsx` | modify | 카드 본문 모바일 15px |
| `app/blog/page.tsx` | modify | 카드 본문 모바일 15px |
| `components/search-box.tsx` | modify | 최근 검색 5건 (localStorage) |
| `app/onboarding/onboarding-flow.tsx` | modify | TOTAL_STEPS 5→3, step 안에 2 컴포넌트 묶음 |
| `lib/analytics.ts` | modify | 새 GA4 이벤트 3개 추가 |

총 14 파일.

---

## Task 1: 모바일 가독성 정밀화 (Section 1)

목표: 모바일에서만 본문/메타 텍스트 한 단계 키움. 데스크톱 회귀 0. 한 번에 일괄 변경 후 chrome 검증.

### 1.1 — 카드 본문 패턴 grep 으로 매핑

- [ ] **Step 1.1: text-[13px] / text-xs / text-sm 위치 검색**

```bash
# 13px 본문 위치
grep -rn 'text-\[13px\]' components/ app/welfare/page.tsx app/loan/page.tsx app/news/page.tsx app/blog/page.tsx 2>/dev/null | head -30

# 12px 메타 (text-xs)
grep -rn 'text-xs' components/blog-card.tsx components/news-card.tsx components/alert-strip.tsx components/feature-grid.tsx components/home-cta.tsx components/home-recommend-card.tsx components/home-recommend-auto.tsx app/welfare/page.tsx app/loan/page.tsx app/news/page.tsx app/blog/page.tsx 2>/dev/null | head -30

# 14px 본문 (text-sm)
grep -rn 'text-sm' components/blog-card.tsx components/news-card.tsx components/alert-strip.tsx components/feature-grid.tsx components/home-cta.tsx components/home-recommend-card.tsx components/home-recommend-auto.tsx app/welfare/page.tsx app/loan/page.tsx app/news/page.tsx app/blog/page.tsx 2>/dev/null | head -30
```

Expected: 각 패턴이 어느 라인에 있는지 매핑.

### 1.2 — 변환 패턴

각 파일에서 다음 패턴으로 변환:

| 검색 패턴 | 교체 패턴 | 의미 |
|---|---|---|
| `text-[13px]` | `text-[13px] max-md:text-[15px]` | 카드 본문 — 모바일 15px |
| `text-sm` (14px 본문 위치만) | `text-sm max-md:text-[15px]` | 카드 본문 — 모바일 15px |
| `text-xs` (메타 위치만) | `text-xs max-md:text-[13px]` | 메타 — 모바일 13px |
| `leading-[1.5]` (본문) | `leading-[1.5] max-md:leading-[1.65]` | 줄간격 — 모바일 1.65 |

**중요**: `text-xs` 모든 사용처를 자동 교체 X. **메타 텍스트 위치만** 교체. 배지·라벨·카운트 같은 작은 텍스트는 그대로 유지 (UI 일관성). 각 파일 수동 검토 후 적용.

`text-sm` 도 마찬가지 — 본문 위치만. 버튼 텍스트는 변경 X.

### 1.3 — 파일별 변경 (각 파일 차례로)

- [ ] **Step 1.3.1: components/blog-card.tsx 변경**

해당 파일 Read 후 카드 본문 (description/excerpt) 의 `text-[13px]` 또는 `text-sm` 위치를 찾고 `max-md:text-[15px]` 추가. 메타 (date, reading_time) 의 `text-xs` 는 `max-md:text-[13px]` 추가.

- [ ] **Step 1.3.2: components/news-card.tsx — 동일 패턴 적용**
- [ ] **Step 1.3.3: components/alert-strip.tsx — 마퀴 본문에만 적용**
- [ ] **Step 1.3.4: components/feature-grid.tsx — 3 STEP 본문에만 적용**
- [ ] **Step 1.3.5: components/home-cta.tsx — CTA 본문에만 적용**
- [ ] **Step 1.3.6: components/home-recommend-card.tsx — 폼 본문에만 적용**
- [ ] **Step 1.3.7: components/home-recommend-auto.tsx — 추천 카드 본문에만 적용**
- [ ] **Step 1.3.8: app/welfare/page.tsx — 인라인 카드 본문에만 적용**
- [ ] **Step 1.3.9: app/loan/page.tsx — 인라인 카드 본문에만 적용**
- [ ] **Step 1.3.10: app/news/page.tsx — 인라인 카드 본문에만 적용**
- [ ] **Step 1.3.11: app/blog/page.tsx — 인라인 카드 본문에만 적용**

### 1.4 — 빌드·타입 검증

- [ ] **Step 1.4: 빌드 통과 확인**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -8
```

Expected: error 0.

### 1.5 — 시각 검증 (chrome)

- [ ] **Step 1.5: chrome 모바일 + 데스크톱 양쪽 검증**

playwright 또는 사장님 chrome:
- 모바일 (390×844): /, /welfare, /loan, /news, /blog → 카드 본문이 13px → 15px 으로 보임 확인
- 데스크톱 (1280×800): 같은 5페이지 → **회귀 0** (글자 크기 변화 없음 확인)

회귀 시: `git diff` 보고 어느 변경이 데스크톱에 영향 줬는지 식정 후 `max-md:` 추가/수정.

### 1.6 — 커밋

- [ ] **Step 1.6: 커밋**

```bash
git add components/blog-card.tsx components/news-card.tsx components/alert-strip.tsx components/feature-grid.tsx components/home-cta.tsx components/home-recommend-card.tsx components/home-recommend-auto.tsx app/welfare/page.tsx app/loan/page.tsx app/news/page.tsx app/blog/page.tsx
git commit -m "feat(a11y): 모바일 본문 13→15px·메타 12→13px·줄간격 1.65 (노년 가독성)"
```

---

## Task 2: 검색박스 최근 검색 5건 (Section 2)

목표: search-box.tsx 1 파일 ~50라인 추가. localStorage 기반 최근 검색.

**Files:** `components/search-box.tsx` (modify)

- [ ] **Step 2.1: search-box.tsx 의 import 영역에 helper 추가**

`"use client";` 직후 또는 컴포넌트 함수 위에:

```tsx
const RECENT_KEY = "keepioo:recent-searches";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* private mode 등 차단 시 무시 */
  }
}
```

- [ ] **Step 2.2: SearchBox 컴포넌트 안 state 추가**

기존 state 들 (`query`, `suggestions`, `showDropdown` 등) 다음에:

```tsx
const [recent, setRecent] = useState<string[]>([]);
useEffect(() => {
  setRecent(loadRecent());
}, []);
```

- [ ] **Step 2.3: handleSearch 안에 pushRecent 추가**

`handleSearch` 함수 안 `router.push(...)` 전에:

```tsx
// 최근 검색 추가 — 중복 제거 후 가장 위로
const trimmed = searchQuery.trim();
const next = [trimmed, ...recent.filter((q) => q !== trimmed)].slice(0, MAX_RECENT);
saveRecent(next);
setRecent(next);
```

- [ ] **Step 2.4: focus 시 query 비어있고 recent 있으면 dropdown 노출**

기존 `onFocus` 핸들러 변경:

```tsx
onFocus={() => {
  setIsFocused(true);
  if (suggestions.length > 0 || recent.length > 0) setShowDropdown(true);
}}
```

- [ ] **Step 2.5: 드롭다운 안에 최근 검색 섹션 추가**

기존 드롭다운 JSX (`{showDropdown && (...)}`) 안, `loading` / `suggestions.length > 0` 분기 위에 새 분기:

```tsx
) : !query && recent.length > 0 ? (
  <div>
    <div className="flex items-center justify-between px-5 py-2 text-xs text-grey-500">
      <span>최근 검색</span>
      <button
        type="button"
        onClick={() => {
          saveRecent([]);
          setRecent([]);
        }}
        className="text-grey-500 hover:text-grey-700 underline"
      >
        전체 삭제
      </button>
    </div>
    {recent.map((q) => (
      <div
        key={q}
        className="flex items-center hover:bg-grey-50 transition-colors"
      >
        <button
          type="button"
          onClick={() => {
            setQuery(q);
            handleSearch(q, "submit");
          }}
          className="flex-1 text-left px-5 py-3 flex items-center gap-3 cursor-pointer border-none bg-transparent"
        >
          <SearchIcon className="w-4 h-4 text-grey-400 shrink-0" />
          <span className="text-sm text-grey-800 truncate">{q}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const next = recent.filter((x) => x !== q);
            saveRecent(next);
            setRecent(next);
          }}
          aria-label={`${q} 삭제`}
          className="px-3 py-3 text-grey-400 hover:text-grey-700 cursor-pointer border-none bg-transparent"
        >
          ×
        </button>
      </div>
    ))}
  </div>
) : suggestions.length > 0 ? (
```

(기존 `loading ? (...) : suggestions.length > 0 ? (...)` 구조에 중간 분기 삽입)

- [ ] **Step 2.6: 빌드·타입 검증**

```bash
bunx tsc --noEmit 2>&1 | tail -5
```

Expected: error 0.

- [ ] **Step 2.7: 동작 검증 (사장님 chrome 또는 playwright)**

1. /search 또는 홈 검색박스 → "청년월세" 검색 실행
2. 다시 홈 → 검색박스 focus → "청년월세" 가 최근 검색에 노출 확인
3. 6번 다른 검색 후 첫 번째 검색이 빠지는지 확인 (max 5)
4. X 버튼 → 개별 삭제
5. "전체 삭제" → 모두 삭제

- [ ] **Step 2.8: 커밋**

```bash
git add components/search-box.tsx
git commit -m "feat(search): 검색박스 최근 검색 5건 (localStorage)"
```

---

## Task 3: 온보딩 5단계 → 3단계 (Section 3)

목표: onboarding-flow.tsx 의 TOTAL_STEPS 변경 + step 분기 안에 2 컴포넌트 묶음.

**Files:**
- Modify: `app/onboarding/onboarding-flow.tsx`
- Modify: `lib/analytics.ts`

### 3.1 — GA4 이벤트 추가

- [ ] **Step 3.1: lib/analytics.ts 의 EVENTS 객체에 신규 이벤트 3개 추가**

기존 `EVENTS` 객체 안에 다음 키 추가:

```ts
ONBOARDING_STEP_BASIC_COMPLETED: "onboarding_step_basic_completed",
ONBOARDING_STEP_ELIGIBILITY_COMPLETED: "onboarding_step_eligibility_completed",
ONBOARDING_STEP_INTERESTS_COMPLETED: "onboarding_step_interests_completed",
```

(기존 `ONBOARDING_STEP_AGE_COMPLETED` 등 5단계별 이벤트가 있다면 그대로 두고 새 이벤트만 추가 — 기존 funnel 데이터 보존)

### 3.2 — onboarding-flow.tsx 수정

- [ ] **Step 3.2: 현재 onboarding-flow.tsx 의 step 분기 영역 확인**

```bash
grep -n 'TOTAL_STEPS\|step ===' app/onboarding/onboarding-flow.tsx
```

`TOTAL_STEPS = 5` 값과 `step === 1` `step === 2` ... 분기 위치 매핑.

- [ ] **Step 3.3: TOTAL_STEPS 5→3 변경**

```tsx
// 총 단계 수
const TOTAL_STEPS = 3;
```

- [ ] **Step 3.4: step 분기 안에 2 컴포넌트 묶음**

기존 `{step === 1 && <StepAge ... />}` ... 5개 분기를 다음 3개로 변경:

```tsx
{step === 1 && (
  <div className="space-y-8">
    <section>
      <h3 className="text-[20px] font-bold text-grey-900 mb-4">1단계 · 기본 정보 — 연령대</h3>
      <StepAge value={state.ageGroup} onChange={(v) => update("ageGroup", v)} />
    </section>
    <hr className="border-grey-100" />
    <section>
      <h3 className="text-[20px] font-bold text-grey-900 mb-4">1단계 · 기본 정보 — 지역</h3>
      <StepRegion
        region={state.region}
        district={state.district}
        onRegionChange={(v) => update("region", v)}
        onDistrictChange={(v) => update("district", v)}
      />
    </section>
  </div>
)}

{step === 2 && (
  <div className="space-y-8">
    <section>
      <h3 className="text-[20px] font-bold text-grey-900 mb-4">2단계 · 자격 — 직업</h3>
      <StepOccupation value={state.occupation} onChange={(v) => update("occupation", v)} />
    </section>
    <hr className="border-grey-100" />
    <section>
      <h3 className="text-[20px] font-bold text-grey-900 mb-4">2단계 · 자격 — 소득 (선택)</h3>
      <StepIncome value={state.incomeLevel} onChange={(v) => update("incomeLevel", v)} />
    </section>
  </div>
)}

{step === 3 && (
  <StepInterests
    interests={state.interests}
    householdTypes={state.householdTypes}
    hasChildren={state.hasChildren}
    onInterestsChange={(v) => update("interests", v)}
    onHouseholdChange={(v) => update("householdTypes", v)}
    onHasChildrenChange={(v) => update("hasChildren", v)}
  />
)}
```

**중요**: 위 props 시그니처는 가정 — 실제 step 컴포넌트의 props 와 일치해야 함. 각 step 컴포넌트 파일을 Read 해서 실제 props 확인 후 수정.

- [ ] **Step 3.5: 다음 버튼 핸들러에 GA4 이벤트 추가**

기존 `next()` 함수 (또는 다음 버튼 onClick) 안에서 step 별 이벤트 발사:

```tsx
function next() {
  if (step === 1) {
    trackEvent(EVENTS.ONBOARDING_STEP_BASIC_COMPLETED, {});
  } else if (step === 2) {
    trackEvent(EVENTS.ONBOARDING_STEP_ELIGIBILITY_COMPLETED, {});
  } else if (step === 3) {
    trackEvent(EVENTS.ONBOARDING_STEP_INTERESTS_COMPLETED, {});
  }
  if (step < TOTAL_STEPS) setStep(step + 1);
  else finish();
}
```

(기존 함수 구조에 맞춰 수정 — 함수명·구조 다를 수 있으니 실제 코드에 맞춤)

- [ ] **Step 3.6: 진행 표시줄 (progress bar) 확인**

기존에 `step / TOTAL_STEPS` 같은 비율 계산이 있다면 자동으로 3 단계 비율 적용. 별도 변경 X.

- [ ] **Step 3.7: StepInterests 가 Household / hasChildren props 받지 않는다면 추가 필요**

step-interests.tsx 의 현재 props 확인:

```bash
grep -n 'interface\|type.*Props\|export function StepInterests' app/onboarding/steps/step-interests.tsx
```

만약 `interests` 만 받고 `householdTypes` 안 받는다면, step-interests.tsx 수정해서 Household select 추가 (또는 step-income.tsx 의 Household 부분이 있다면 그걸 step-interests 로 이동).

(이 단계 작업량은 step-interests.tsx 의 현재 구현에 따라 달라짐 — 실제 구조 확인 후 결정)

### 3.3 — 빌드·타입 검증

- [ ] **Step 3.8: 빌드 통과 확인**

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run build 2>&1 | tail -8
```

Expected: error 0.

### 3.4 — 동작 검증

- [ ] **Step 3.9: 온보딩 3단계 완주 시뮬레이션**

사장님 본인 마이페이지 → "온보딩 다시 하기" 링크 또는 chrome incognito 신규 가입 → 3단계 완주 → /mypage?onboarded=1 redirect 확인.

각 단계:
- 1단계: 연령대 + 지역 모두 선택 → 다음 활성화
- 2단계: 직업 + 소득 (소득은 skip 가능) → 다음 활성화
- 3단계: 관심사 + 가구상태 → 완료 활성화

회귀 발견 시 즉시 보고.

### 3.5 — 커밋

- [ ] **Step 3.10: 커밋**

```bash
git add app/onboarding/onboarding-flow.tsx lib/analytics.ts
git commit -m "feat(onboarding): 5단계 → 3단계 묶음 (Age+Region / Occupation+Income / Interests+Household)"
```

---

## Task 4: 종합 검증 + push

- [ ] **Step 4.1: lighthouse 회귀 측정 (선택)**

Phase 1 baseline (.lighthouse-results-baseline) 대비 -5점 이내 유지 확인:

```bash
# prod 서버 기동 또는 prod URL
PORT=3100 bun run start &
sleep 3
for p in home welfare loan news blog; do
  url="http://localhost:3100"
  [ "$p" != "home" ] && url="$url/$p"
  npx -y lighthouse@latest "$url" \
    --output=json --output-path=".lighthouse-results/$p-mobile.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance --quiet
done

node -e "
const fs = require('fs');
for (const p of ['home','welfare','loan','news','blog']) {
  const b = JSON.parse(fs.readFileSync('.lighthouse-results-baseline/' + p + '-mobile.json'));
  const a = JSON.parse(fs.readFileSync('.lighthouse-results/' + p + '-mobile.json'));
  const bs = Math.round(b.categories.performance.score * 100);
  const as_ = Math.round(a.categories.performance.score * 100);
  console.log(p, ':', bs, '→', as_, '(delta:', as_ - bs, ')');
}
"
```

회귀 -10 이상 시 어떤 변경이 원인인지 git diff 로 분석. -5 이내면 OK.

- [ ] **Step 4.2: chrome 모바일 + 데스크톱 종합 검증**

playwright 또는 사장님 chrome:
- 모바일 (390): 5페이지 가독성 확인 + 검색박스 최근 검색 + 온보딩 3단계
- 데스크톱 (1280): 5페이지 회귀 0

- [ ] **Step 4.3: push**

```bash
git push origin master
```

(사장님 명시 후에만 — CLAUDE.md "물어보지 않고 push 금지")

- [ ] **Step 4.4: 메모리 갱신**

`~/.claude/projects/.../memory/project_keepioo_status.md` 또는 새 메모리 파일 (`project_keepioo_phase2_ux_2026_04_28.md`) 에 결과 기록 + MEMORY.md 인덱스 추가.

---

## Self-Review

### 1. Spec 커버리지

| Spec section | Plan task | 커버 |
|---|---|---|
| Section 1 가독성 | Task 1 | ✅ |
| Section 2 최근 검색 | Task 2 | ✅ |
| Section 3 온보딩 5→3 | Task 3 | ✅ |
| 검증 (시각·lighthouse) | Task 4 | ✅ |

### 2. 회귀 가드
- 각 task 후 빌드·타입 검증
- 모든 task 끝나면 lighthouse 비교
- 시각 검증 (모바일 + 데스크톱)
- push 는 사장님 명시 시

### 3. Type 일관성
- localStorage 키 `keepioo:recent-searches` 일관
- GA4 이벤트 이름 `ONBOARDING_STEP_*_COMPLETED` 일관
- step props 시그니처는 실제 컴포넌트 코드에 맞춰 적용 (Task 3.4 의 가정 props 는 Read 후 정정 필요)

### 4. 위험 요소

- **온보딩 step 컴포넌트 props 시그니처 불일치** — Task 3 진행 시 각 step 파일 Read 후 실제 props 에 맞춰 호출. plan 의 가정 코드 그대로 적용 시 type error 가능.
- **Household / hasChildren 위치** — 현재 step-income.tsx 또는 step-interests.tsx 어디 있는지 확인 후 통합 단계 결정.
- **GA4 기존 이벤트 보존** — 기존 step 별 이벤트 (`ONBOARDING_STEP_AGE_COMPLETED` 등) 가 있다면 그대로 두고 새 이벤트 추가 (기존 funnel 분석 깨짐 방지).

---

## 진행 후 보고

각 task 완료 후 짧게 보고:

```
✅ Task N 완료
- 변경: <파일 N개>, 커밋: <hash>
- 검증: 빌드·타입 통과
- 다음 task 진행
```

전체 완료 시:
```
✅ Phase 2 완료
- 3 task 모두 완료, 3 커밋 푸시
- 회귀: lighthouse -X점 (목표 -5 이내)
- 다음 phase 추천: Phase 3 (AI 진단 인라인 임베드) 또는 Phase 4 (수익화)
```
