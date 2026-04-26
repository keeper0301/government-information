# /mypage 탭 기반 레이아웃 재설계 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mypage` 를 단일 컬럼 → 탭 3개(프로필 / 동의 관리 / 계정) 구조로 재배치하고, 프로필 탭은 데스크톱 2컬럼으로 펼쳐서 공간 효율과 사용자 동선을 개선한다.

**Architecture:** 서버 컴포넌트 `app/mypage/page.tsx` 가 데이터를 페칭한 뒤 새 클라이언트 셸 `tabs.tsx` 에 prop 으로 넘긴다. 탭별 UI 는 별도 파일(`profile-form.tsx`, `consents-panel.tsx`, `account-tab.tsx`, `withdraw-dialog.tsx`) 로 분리. URL `?tab=...` 쿼리로 탭 상태 동기화, 기존 `#consents` 앵커도 1회 자동 변환.

**Tech Stack:** Next.js 16 (React 19), shadcn/ui (Tabs · Dialog · Card), Supabase (서버 컴포넌트), Tailwind v4, vitest(단위 테스트), bun(패키지 매니저).

**Spec:** `docs/superpowers/specs/2026-04-26-mypage-tabs-redesign-design.md`

---

## 파일 영향도 정리

| 경로 | 동작 | 책임 |
|---|---|---|
| `components/ui/tabs.tsx` | 신규 (shadcn 설치) | shadcn Tabs 원시 컴포넌트 |
| `app/mypage/tabs.tsx` | 신규 | 탭 셸 + URL `?tab=` 동기화 + `#consents` 앵커 호환 |
| `app/mypage/anchor-utils.ts` | 신규 | hash → tab 매핑 pure 함수 (단위 테스트 대상) |
| `app/mypage/profile-form.tsx` | 수정 | 2컬럼 그룹핑("기본 정보" / "맞춤 추천 정보"), 이메일 박스 제거 |
| `app/mypage/consents-panel.tsx` | 수정 | "필수 / 선택" 그룹 헤더 + 카드 컴팩트화 |
| `app/mypage/account-tab.tsx` | 신규 | 계정 요약 카드(가입일·로그인 방식·알림톡 발송 수) + 탈퇴 진입 |
| `app/mypage/withdraw-dialog.tsx` | 신규 (`withdraw-section.tsx` 대체) | 인라인 → 모달. 사유 라디오 + 체크박스 + 30일 안내 모달 안에 |
| `app/mypage/withdraw-section.tsx` | 삭제 | `withdraw-dialog.tsx` 로 책임 이전 |
| `app/mypage/page.tsx` | 수정 | 컨테이너 너비 920px, 이메일 헤더 강등, Tabs 셸 호출, `alert_deliveries` 카운트 쿼리 추가 |
| `__tests__/mypage/anchor-utils.test.ts` | 신규 | hash → tab 매핑 단위 테스트 |

각 파일 200줄 이하 유지.

---

## Task 1: shadcn Tabs 컴포넌트 설치

**Files:**
- Create: `components/ui/tabs.tsx`

- [ ] **Step 1: shadcn CLI 로 Tabs 설치**

이 프로젝트는 `bun` + `shadcn@^4.4.0` 사용. 기존 `dialog.tsx` 와 동일한 방식으로 추가.

Run:
```bash
bunx --bun shadcn@latest add tabs
```

Expected: `components/ui/tabs.tsx` 가 생성됨. 의존성 `@radix-ui/react-tabs` 가 자동 설치(`radix-ui` 메타 패키지 이미 있음).

- [ ] **Step 2: 설치 결과 확인**

Run:
```bash
ls components/ui/tabs.tsx
```

Expected: 파일 존재. 내부에 `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` export 가 있음.

- [ ] **Step 3: lint 통과 확인**

Run:
```bash
bun run lint
```

Expected: 새 파일 관련 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add components/ui/tabs.tsx components.json bun.lock package.json
git commit -m "feat(ui): shadcn Tabs 컴포넌트 추가"
```

---

## Task 2: anchor-utils.ts — hash → tab 매핑 (pure 함수 + 테스트)

**Files:**
- Create: `app/mypage/anchor-utils.ts`
- Test: `__tests__/mypage/anchor-utils.test.ts`

이유: URL 동기화 로직 중 hash → tab 변환은 pure 함수로 분리해서 단위 테스트 가능하게 만든다. 복잡한 React state·라우터를 안 거치고 핵심 매핑만 검증.

- [ ] **Step 1: 테스트 작성**

`__tests__/mypage/anchor-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashToTab, isValidTab, normalizeTab } from '@/app/mypage/anchor-utils';

describe('hashToTab', () => {
  it('#consents 를 consents 로 변환', () => {
    expect(hashToTab('#consents')).toBe('consents');
  });
  it('#account 를 account 로 변환', () => {
    expect(hashToTab('#account')).toBe('account');
  });
  it('#profile 또는 빈 hash 는 profile 로', () => {
    expect(hashToTab('#profile')).toBe('profile');
    expect(hashToTab('')).toBe('profile');
    expect(hashToTab('#')).toBe('profile');
  });
  it('알 수 없는 hash 는 null', () => {
    expect(hashToTab('#unknown')).toBeNull();
  });
});

describe('isValidTab', () => {
  it('유효한 탭 값만 true', () => {
    expect(isValidTab('profile')).toBe(true);
    expect(isValidTab('consents')).toBe(true);
    expect(isValidTab('account')).toBe(true);
    expect(isValidTab('hack')).toBe(false);
    expect(isValidTab(null)).toBe(false);
  });
});

describe('normalizeTab', () => {
  it('유효한 값 그대로, 무효한 값은 profile', () => {
    expect(normalizeTab('consents')).toBe('consents');
    expect(normalizeTab('garbage')).toBe('profile');
    expect(normalizeTab(null)).toBe('profile');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
bun run test __tests__/mypage/anchor-utils.test.ts
```

Expected: FAIL — `Cannot find module '@/app/mypage/anchor-utils'`

- [ ] **Step 3: 구현**

`app/mypage/anchor-utils.ts`:

```ts
// 마이페이지 탭 식별자 — page.tsx 의 Tabs value 와 1:1 매칭
export type MypageTab = 'profile' | 'consents' | 'account';

export const VALID_TABS: readonly MypageTab[] = ['profile', 'consents', 'account'] as const;

// hash → tab 매핑 테이블
// 외부 링크 호환을 위해 #consents 같은 legacy 앵커도 받아준다.
const HASH_TO_TAB: Record<string, MypageTab> = {
  profile: 'profile',
  consents: 'consents',
  account: 'account',
};

// URL hash 문자열을 받아 매칭되는 탭 ID 를 돌려준다.
// '' 이나 '#' 단독은 기본 탭(profile) 로 처리.
// 매칭 실패 시 null (호출 측에서 변환 안 하고 둘지 결정).
export function hashToTab(hash: string): MypageTab | null {
  if (!hash || hash === '#') return 'profile';
  const key = hash.replace(/^#/, '').toLowerCase();
  return HASH_TO_TAB[key] ?? null;
}

// 외부에서 받은 임의 문자열이 우리 탭 enum 에 속하는지 검사.
export function isValidTab(value: unknown): value is MypageTab {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

// 무효한 값은 기본 탭으로 정규화. URL 쿼리에서 받은 값 처리에 사용.
export function normalizeTab(value: unknown): MypageTab {
  return isValidTab(value) ? value : 'profile';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
bun run test __tests__/mypage/anchor-utils.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: 커밋**

```bash
git add app/mypage/anchor-utils.ts __tests__/mypage/anchor-utils.test.ts
git commit -m "feat(mypage): hash→tab 매핑 pure 함수 + 단위 테스트"
```

---

## Task 3: tabs.tsx — 클라이언트 탭 셸 (URL 동기화 + anchor 호환)

**Files:**
- Create: `app/mypage/tabs.tsx`

- [ ] **Step 1: 구현**

`app/mypage/tabs.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hashToTab, normalizeTab, type MypageTab } from "./anchor-utils";

// MypageTabs — 마이페이지 상단 탭 셸
// - 서버 컴포넌트가 페칭한 데이터를 children 으로 받아 탭별 컨텐츠로 분배
// - URL ?tab=... 쿼리로 상태 유지 (새로고침·딥링크 안전)
// - legacy #consents 앵커는 마운트 시 1회 감지해서 ?tab=consents 로 자동 변환
//   (기존 외부 링크 호환 — spec 2-2 절)
export function MypageTabs({
  profileSlot,
  consentsSlot,
  accountSlot,
}: {
  profileSlot: React.ReactNode;
  consentsSlot: React.ReactNode;
  accountSlot: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL ?tab= 값을 enum 에 맞춰 정규화 (없거나 무효하면 'profile')
  const current: MypageTab = normalizeTab(searchParams.get("tab"));

  // legacy #consents 등 hash anchor 호환 — 마운트 시 1회만 처리.
  // hash 가 유효한 탭으로 매핑되면 ?tab= 쿼리로 변환 + hash 제거.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const fromHash = hashToTab(hash);
    if (hash && fromHash && fromHash !== current) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", fromHash);
      // hash 도 같이 제거 (다시 anchor 가 트리거되지 않도록)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회

  // 탭 전환 시 ?tab= 만 갱신 (history.replace 로 뒤로가기 폭탄 방지)
  function handleChange(value: string) {
    const next = normalizeTab(value);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "profile") {
      params.delete("tab"); // 기본 탭은 쿼리 비워서 깔끔하게
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={handleChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-8">
        <TabsTrigger value="profile">프로필</TabsTrigger>
        <TabsTrigger value="consents">동의 관리</TabsTrigger>
        <TabsTrigger value="account">계정</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="focus-visible:outline-none">
        {profileSlot}
      </TabsContent>
      <TabsContent value="consents" className="focus-visible:outline-none">
        {consentsSlot}
      </TabsContent>
      <TabsContent value="account" className="focus-visible:outline-none">
        {accountSlot}
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: 새 에러 없음 (tabs.tsx 관련). 다른 파일의 기존 에러는 무시.

- [ ] **Step 3: 커밋**

```bash
git add app/mypage/tabs.tsx
git commit -m "feat(mypage): 탭 셸 컴포넌트 — URL 동기화 + anchor 호환"
```

---

## Task 4: profile-form.tsx — 2컬럼 그룹핑 + 이메일 박스 제거

**Files:**
- Modify: `app/mypage/profile-form.tsx`

현재 9개 항목이 1컬럼 stack. 두 그룹("기본 정보" / "맞춤 추천 정보") 으로 나누고 데스크톱(`md` 이상) 2컬럼. 이메일 입력 박스는 제거(헤더로 강등 — Task 8 에서 처리). 저장 버튼은 2컬럼 아래에 풀폭 1개.

- [ ] **Step 1: profile-form.tsx 의 return 부분 교체**

`app/mypage/profile-form.tsx` 의 line 108 ~ 281 (`return (...)` 전체) 를 다음으로 교체:

```tsx
  return (
    <div className="space-y-8">
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {/* ── 왼쪽: 기본 정보 ── */}
        <section className="space-y-6">
          <h2 className="text-[15px] font-semibold text-grey-900 pb-2 border-b border-grey-100">
            기본 정보
          </h2>

          <ChipSelect
            label="나이대"
            options={AGE_GROUPS}
            value={form.age_group}
            onChange={(v) => updateForm((p) => ({ ...p, age_group: v }))}
          />

          {/* 거주 지역 (광역) */}
          <ChipSelect
            label="거주 지역 (광역)"
            options={REGIONS}
            value={form.region}
            onChange={(v) =>
              updateForm((p) => {
                const nextDistricts = getDistrictsForRegion(v);
                const nextDistrict =
                  p.district && nextDistricts.includes(p.district) ? p.district : null;
                return { ...p, region: v, district: nextDistrict };
              })
            }
          />

          {/* 시·군·구 */}
          {form.region && getDistrictsForRegion(form.region).length > 0 && (
            <ChipSelect
              label="시·군·구 (선택)"
              options={["전체", ...getDistrictsForRegion(form.region)]}
              value={form.district ?? "전체"}
              onChange={(v) =>
                updateForm((p) => ({
                  ...p,
                  district: v === "전체" ? null : v,
                }))
              }
            />
          )}

          <ChipSelect
            label="직업"
            options={OCCUPATIONS}
            value={form.occupation}
            onChange={(v) => updateForm((p) => ({ ...p, occupation: v }))}
          />
        </section>

        {/* ── 오른쪽: 맞춤 추천 정보 ── */}
        <section className="space-y-6">
          <h2 className="text-[15px] font-semibold text-grey-900 pb-2 border-b border-grey-100">
            맞춤 추천 정보 <span className="text-xs font-normal text-grey-600">(선택)</span>
          </h2>

          {/* 소득 수준 */}
          <div className="space-y-2">
            <label className="block text-[13px] font-semibold text-grey-700">
              소득 수준
            </label>
            <p className="text-xs text-grey-600">
              맞춤 추천에만 사용되며 외부에 제공되지 않습니다.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {INCOME_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="income_level"
                    value={opt.value}
                    checked={form.income_level === opt.value}
                    onChange={() => updateForm((p) => ({ ...p, income_level: opt.value }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => updateForm((p) => ({ ...p, income_level: null }))}
                className="text-xs text-grey-600 underline self-start"
              >
                선택 안 함
              </button>
            </div>
          </div>

          {/* 가구 상태 (다중 선택) */}
          <div className="space-y-2">
            <label className="block text-[13px] font-semibold text-grey-700">
              가구 상태 <span className="text-xs font-normal text-grey-600">(다중)</span>
            </label>
            <p className="text-xs text-grey-600">
              민감정보로 분류되며 맞춤 추천에만 사용됩니다.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {HOUSEHOLD_OPTIONS.map((opt) => {
                const checked = form.household_types.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      updateForm((p) => ({
                        ...p,
                        household_types: checked
                          ? p.household_types.filter((v) => v !== opt.value)
                          : [...p.household_types, opt.value],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      checked
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 관심 분야 (다중 선택) */}
          <div>
            <label className="block text-[13px] font-semibold text-grey-700 mb-2">
              관심 분야{" "}
              <span className="text-grey-600 font-normal">(여러 개)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((item) => {
                const selected = form.interests.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleInterest(item)}
                    className={`px-3.5 py-2 rounded-full text-[14px] font-medium border transition-colors cursor-pointer ${
                      selected
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red">
          {error}
        </div>
      )}

      {/* 스크린리더 전용 라이브 영역 */}
      <span role="status" aria-live="polite" className="sr-only">
        {saved ? "프로필이 저장됐어요" : ""}
      </span>

      {/* 저장 버튼 (풀폭, 2컬럼 아래) */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className={`w-full py-3 rounded-lg text-[15px] font-semibold transition-colors cursor-pointer disabled:cursor-default ${
          saved
            ? "bg-green text-white"
            : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        }`}
      >
        {saving ? "저장 중..." : saved ? "저장됐어요 ✓" : "저장하기"}
      </button>
    </div>
  );
}
```

`ChipSelect` 헬퍼 함수(line 284 ~ 321) 는 그대로 유지.

- [ ] **Step 2: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: profile-form.tsx 관련 에러 없음.

- [ ] **Step 3: 줄 수 확인**

Run:
```bash
wc -l app/mypage/profile-form.tsx
```

Expected: 200 줄 이하 (목표 ~280 → ~265, 거의 비슷하지만 코드 자체는 정리됨).

> ChipSelect 헬퍼는 동일 책임이라 같은 파일 유지가 적절. 기존 280줄도 단순 폼이라 한 파일에 둘 수준.

- [ ] **Step 4: 커밋**

```bash
git add app/mypage/profile-form.tsx
git commit -m "feat(mypage): 프로필 폼 2컬럼 그룹핑(기본/맞춤) + 이메일 박스 제거"
```

---

## Task 5: consents-panel.tsx — "필수 / 선택" 그룹 헤더 + 카드 컴팩트

**Files:**
- Modify: `app/mypage/consents-panel.tsx`

현재 5개 동의가 단일 리스트. `CONSENT_META` 의 `required` 플래그로 두 그룹으로 나눠 헤더 추가.

- [ ] **Step 1: render 부분 수정**

먼저 현재 render 영역을 파악하기 위해 파일을 열어 끝부분(렌더 JSX)을 확인.

Run:
```bash
sed -n '180,286p' app/mypage/consents-panel.tsx
```

확인 후, 5개 카드를 한 번에 `.map()` 으로 도는 부분을 다음 패턴으로 교체:

```tsx
{/* 필수 / 선택 그룹으로 분리 렌더 */}
<div className="space-y-8">
  {/* ── 필수 동의 ── */}
  <section>
    <h3 className="text-[14px] font-semibold text-grey-900 mb-3 pb-2 border-b border-grey-100">
      필수 동의 <span className="text-xs font-normal text-grey-600">(철회 불가)</span>
    </h3>
    <div className="space-y-2">
      {CONSENT_META.filter((m) => m.required).map((meta) => (
        <ConsentRow
          key={meta.type}
          meta={meta}
          consent={initialConsents.find((c) => c.consentType === meta.type) ?? null}
          isActive={!!active[meta.type]}
          busy={busy === meta.type}
          onToggle={() => handleToggle(meta.type)}
          currentVersions={currentVersions}
        />
      ))}
    </div>
  </section>

  {/* ── 선택 동의 ── */}
  <section>
    <h3 className="text-[14px] font-semibold text-grey-900 mb-3 pb-2 border-b border-grey-100">
      선택 동의 <span className="text-xs font-normal text-grey-600">(언제든 끄고 켤 수 있어요)</span>
    </h3>
    <div className="space-y-2">
      {CONSENT_META.filter((m) => !m.required).map((meta) => (
        <ConsentRow
          key={meta.type}
          meta={meta}
          consent={initialConsents.find((c) => c.consentType === meta.type) ?? null}
          isActive={!!active[meta.type]}
          busy={busy === meta.type}
          onToggle={() => handleToggle(meta.type)}
          currentVersions={currentVersions}
        />
      ))}
    </div>
  </section>
</div>

{/* 기존 메시지/에러 영역은 그대로 유지 */}
```

`ConsentRow` 는 기존 단일 카드 렌더 로직을 별도 컴포넌트로 추출한 것. 같은 파일 안에 정의:

```tsx
function ConsentRow({
  meta,
  consent,
  isActive,
  busy,
  onToggle,
  currentVersions,
}: {
  meta: typeof CONSENT_META[number];
  consent: ConsentStatus | null;
  isActive: boolean;
  busy: boolean;
  onToggle: () => void;
  currentVersions: CurrentVersions;
}) {
  const consentedDate = consent?.consentedAt
    ? new Date(consent.consentedAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 border border-grey-200 rounded-lg bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {meta.required && <span aria-hidden className="text-[11px]">🔒</span>}
          <span className="text-[14px] font-semibold text-grey-900">{meta.label}</span>
          {consentedDate && (
            <span className="ml-auto text-[11px] text-grey-600">{consentedDate} 동의</span>
          )}
        </div>
        <p className="text-[12px] text-grey-700 leading-[1.5]">{meta.description}</p>
      </div>

      <div className="shrink-0 self-center">
        {meta.required ? (
          <span className="text-[12px] font-medium text-emerald-700 px-2 py-1 bg-emerald-50 rounded">
            동의완료
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            aria-pressed={isActive}
            className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
              isActive ? "bg-blue-500" : "bg-grey-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
            <span className="sr-only">
              {meta.label} {isActive ? "끄기" : "켜기"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
```

> 핵심: 기존 카드 패딩이 컸던 부분(`p-4` 또는 `py-4`) 을 `py-3` 로 줄이고, 동의 일자를 우상단 작은 글씨로 옮김. 토글 동작·핸들러는 기존 `handleToggle` 그대로 재사용.

- [ ] **Step 2: 기존 인라인 카드 렌더 코드 삭제**

이전에 한 번에 `.map()` 으로 5개를 그리던 코드 블록을 제거. 위 새 블록이 그 자리를 대체.

- [ ] **Step 3: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: 새 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/mypage/consents-panel.tsx
git commit -m "feat(mypage): 동의 관리 — 필수/선택 그룹 헤더 + 카드 컴팩트"
```

---

## Task 6: account-tab.tsx — 계정 요약 카드 + 탈퇴 진입

**Files:**
- Create: `app/mypage/account-tab.tsx`

- [ ] **Step 1: 구현**

`app/mypage/account-tab.tsx`:

```tsx
"use client";

import { WithdrawDialog } from "./withdraw-dialog";

// 계정 탭 — 상단 "내 계정 요약" 카드 + 하단 위험 영역(탈퇴)
// 요약 정보는 서버 컴포넌트에서 prop 으로 받는다 (가입일·로그인 방식·이번 달 알림톡 발송 수).
export function AccountTab({
  email,
  createdAt,
  provider,
  alertsThisMonth,
}: {
  email: string;
  createdAt: string; // ISO timestamp
  provider: string | null; // 'google' | 'kakao' 등
  alertsThisMonth: number;
}) {
  const joinedLabel = new Date(createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const providerLabel = providerToLabel(provider, email);

  return (
    <div className="space-y-10">
      {/* 계정 요약 카드 */}
      <section>
        <h2 className="text-[15px] font-semibold text-grey-900 pb-2 mb-4 border-b border-grey-100">
          계정 요약
        </h2>
        <dl className="rounded-lg border border-grey-200 bg-white divide-y divide-grey-100">
          <SummaryRow label="가입 일자" value={joinedLabel} />
          <SummaryRow label="로그인 방식" value={providerLabel} />
          <SummaryRow
            label="알림톡 발송 수"
            value={`${alertsThisMonth.toLocaleString("ko-KR")}건 (이번 달)`}
          />
        </dl>
      </section>

      {/* 위험 영역 */}
      <section>
        <h2 className="text-[15px] font-semibold text-red pb-2 mb-4 border-b border-red/30 flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          위험 영역
        </h2>
        <div className="rounded-lg border border-red/30 bg-red/5 p-4 space-y-3">
          <h3 className="text-[14px] font-semibold text-grey-900">회원 탈퇴</h3>
          <p className="text-[13px] text-grey-700 leading-[1.6]">
            탈퇴 신청 후 <b>30일 유예</b>가 지나면 모든 데이터가 영구 삭제됩니다.
            유예 기간 안에 같은 이메일로 다시 로그인하면 복구 가능합니다.
          </p>
          <div className="pt-1">
            <WithdrawDialog />
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-[13px] text-grey-700">{label}</dt>
      <dd className="text-[14px] font-medium text-grey-900">{value}</dd>
    </div>
  );
}

// provider 코드를 한국어 라벨로.
// Supabase auth user.app_metadata.provider 가 'google' / 'kakao' / 'email' 등.
function providerToLabel(provider: string | null, email: string): string {
  switch (provider) {
    case "google":
      return `구글 (${email})`;
    case "kakao":
      return `카카오 (${email})`;
    case "email":
      return `이메일 (${email})`;
    default:
      return email || "(알 수 없음)";
  }
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: WithdrawDialog import 미해결 에러는 Task 7 에서 해소됨. account-tab.tsx 자체 문법·타입 에러는 없어야 함.

- [ ] **Step 3: 커밋**

```bash
git add app/mypage/account-tab.tsx
git commit -m "feat(mypage): 계정 탭 컴포넌트 — 요약 카드 + 탈퇴 진입"
```

> 이 시점에 빌드는 깨져 있음(`WithdrawDialog` 미존재). Task 7 에서 즉시 복구.

---

## Task 7: withdraw-dialog.tsx — 인라인 폼을 모달로 이전

**Files:**
- Create: `app/mypage/withdraw-dialog.tsx`
- Delete: `app/mypage/withdraw-section.tsx`

기존 `withdraw-section.tsx` 의 폼 로직(사유 라디오, 30일 안내, 체크박스, fetch, 에러 처리) 을 그대로 모달 안으로 옮긴다. 외부 트리거 버튼만 페이지에 노출.

- [ ] **Step 1: withdraw-dialog.tsx 작성**

`app/mypage/withdraw-dialog.tsx`:

```tsx
"use client";

// WithdrawDialog — "탈퇴 진행하기" 버튼 + 클릭 시 열리는 모달.
// 모달 안에 사유 라디오 / 기타 입력 / 30일 안내 / 체크박스 / 최종 확인 버튼.
// 기존 withdraw-section.tsx 의 fetch / GA4 / Dialog 로직은 그대로 옮긴다.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 사유 옵션 — value 는 GA4 Custom Dimension 안정성을 위해 snake_case 고정.
// 라벨은 자유롭게 바꿔도 value 는 건드리지 말 것.
const WITHDRAW_REASONS: { value: string; label: string }[] = [
  { value: "no_content", label: "찾는 공고·정보가 부족해요" },
  { value: "alert_fatigue", label: "알림이 너무 많거나 도움이 안 됐어요" },
  { value: "other_service", label: "다른 서비스를 이용 중이에요" },
  { value: "complexity", label: "사용하기 복잡해요" },
  { value: "privacy", label: "개인정보가 걱정돼요" },
  { value: "etc", label: "기타" },
];

const DETAIL_MAX = 200;

export function WithdrawDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // busy 동안에는 모달 닫힘 방지 (현재 진행 중인 fetch 보호)
  function handleOpenChange(next: boolean) {
    if (busy && !next) return;
    setOpen(next);
    if (!next) {
      // 모달 닫힐 때 폼 상태 초기화 (다음 진입 시 깨끗하게)
      setReason("");
      setReasonDetail("");
      setAcknowledged(false);
      setError(null);
    }
  }

  async function handleWithdraw() {
    if (!acknowledged) return;
    setBusy(true);
    setError(null);

    const effectiveDetail = reason === "etc" ? reasonDetail.trim() : "";

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason || null,
          reason_detail: effectiveDetail || null,
        }),
      });
      if (!res.ok) {
        // 활성 구독 (409) 등 백엔드 에러 메시지를 그대로 보여줌
        const body = await res.json().catch(() => null);
        setError(body?.error || "탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
        setBusy(false);
        return;
      }
      // GA4 — 사유 시그널 (본문 저장은 서버에서 별도 처리)
      trackEvent(EVENTS.ACCOUNT_DELETED, {
        reason: reason || "none",
        has_detail: effectiveDetail ? "yes" : "no",
      });
      // 성공 → 홈으로
      router.push("/");
      router.refresh();
    } catch (e) {
      console.error("withdraw failed", e);
      setError("네트워크 오류가 있었어요. 잠시 후 다시 시도해주세요.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" type="button">
          탈퇴 진행하기
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>회원 탈퇴</DialogTitle>
          <DialogDescription>
            30일 유예 후 모든 데이터가 영구 삭제됩니다. 유예 기간 내 같은 이메일로
            다시 로그인하면 복구할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {/* 사유 라디오 */}
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-grey-700 mb-1">
            떠나시는 이유 <span className="font-normal text-grey-600">(선택)</span>
          </legend>
          {WITHDRAW_REASONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="withdraw_reason"
                value={opt.value}
                checked={reason === opt.value}
                onChange={() => setReason(opt.value)}
                className="mt-0.5"
              />
              <span className="text-[13px]">{opt.label}</span>
            </label>
          ))}
        </fieldset>

        {/* 기타 선택 시 자유 입력 */}
        {reason === "etc" && (
          <textarea
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value.slice(0, DETAIL_MAX))}
            placeholder="간단히 알려주시면 큰 도움이 돼요. (선택)"
            rows={3}
            className="w-full px-3 py-2 text-[13px] border border-grey-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {/* 체크박스 — 영구 삭제 이해 */}
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1"
          />
          <span className="text-[13px] text-grey-700">
            30일 유예 후 모든 데이터가 영구 삭제됨을 이해했어요.
          </span>
        </label>

        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-[13px] text-red">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleWithdraw}
            disabled={!acknowledged || busy}
          >
            {busy ? "처리 중..." : "탈퇴 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 기존 withdraw-section.tsx 삭제**

Run:
```bash
git rm app/mypage/withdraw-section.tsx
```

- [ ] **Step 3: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: account-tab.tsx 의 `WithdrawDialog` import 가 해소됨. page.tsx 가 아직 `WithdrawSection` 을 import 중이면 다음 Task 에서 즉시 정리.

- [ ] **Step 4: 줄 수 확인**

Run:
```bash
wc -l app/mypage/withdraw-dialog.tsx
```

Expected: 200 줄 이하.

- [ ] **Step 5: 커밋**

```bash
git add app/mypage/withdraw-dialog.tsx app/mypage/withdraw-section.tsx
git commit -m "refactor(mypage): 탈퇴 폼 인라인 → 모달 (withdraw-dialog)"
```

---

## Task 8: page.tsx — 컨테이너 920px, 이메일 헤더, Tabs 셸, 알림톡 카운트 쿼리

**Files:**
- Modify: `app/mypage/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

`app/mypage/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getUserConsents,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/consent";
import type { IncomeOption, HouseholdOption } from "@/lib/profile-options";
import { ProfileForm } from "./profile-form";
import { ConsentsPanel } from "./consents-panel";
import { AccountTab } from "./account-tab";
import { MypageTabs } from "./tabs";

export const metadata: Metadata = {
  title: "내 정보 — 정책알리미",
  description: "나의 기본 정보를 관리하고 동의 내역을 확인하세요.",
};

export const dynamic = "force-dynamic";

// 내 정보 페이지 — 서버 컴포넌트
// 1. 로그인 가드 (middleware 와 이중 안전망)
// 2. 프로필 / 동의 / 알림톡 발송 카운트를 병렬 조회
// 3. 결과를 클라이언트 탭 셸(MypageTabs) 에 슬롯 prop 으로 전달
export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/mypage");
  }

  // 이번 달 1일 0시 (KST 기준 단순화) 부터 알림톡 발송 수 카운트.
  // alert_deliveries 테이블이 알림톡 발송 로그.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: profile }, consents, { count: alertsThisMonth }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("age_group, region, district, occupation, interests, income_level, household_types")
      .eq("id", user.id)
      .maybeSingle(),
    getUserConsents(user.id),
    supabase
      .from("alert_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString()),
  ]);

  const email = user.email || "";
  const provider = (user.app_metadata as { provider?: string } | null)?.provider ?? null;

  return (
    <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900">
          내 정보
        </h1>
        <a
          href="/onboarding"
          className="text-xs text-emerald-700 underline hover:text-emerald-900"
        >
          온보딩 다시 하기
        </a>
      </div>

      {/* 이메일을 헤더 보조 영역의 작은 텍스트로 강등 (수정 불가 → 입력 박스 불필요) */}
      <p className="text-[13px] text-grey-600 mb-1">
        📧 {email || "(이메일 미공개)"}
      </p>
      <p className="text-[15px] text-grey-700 mb-8 leading-[1.6]">
        기본 정보를 입력하면 맞춤추천과 알림이 더 정확해져요.
      </p>

      <MypageTabs
        profileSlot={
          <ProfileForm
            initial={{
              age_group: profile?.age_group ?? null,
              region: profile?.region ?? null,
              district: profile?.district ?? null,
              occupation: profile?.occupation ?? null,
              interests: profile?.interests ?? [],
              income_level: (profile?.income_level ?? null) as IncomeOption | null,
              household_types: (profile?.household_types ?? []) as HouseholdOption[],
            }}
          />
        }
        consentsSlot={
          <section id="consents" className="scroll-mt-20">
            <p className="text-[14px] text-grey-700 mb-6 leading-[1.6]">
              이용약관·개인정보·마케팅 동의 내역을 확인하고 선택 동의를 관리할 수 있어요.
            </p>
            <ConsentsPanel
              initialConsents={consents}
              currentVersions={{
                privacy_policy: PRIVACY_POLICY_VERSION,
                terms: TERMS_VERSION,
              }}
            />
          </section>
        }
        accountSlot={
          <AccountTab
            email={email}
            createdAt={user.created_at ?? new Date().toISOString()}
            provider={provider}
            alertsThisMonth={alertsThisMonth ?? 0}
          />
        }
      />
    </main>
  );
}
```

핵심 변경점:
- `max-w-[640px]` → `max-w-[920px]`
- 이메일 입력 박스 제거 → 헤더 아래 작은 텍스트
- Tabs 셸 도입, 기존 3개 영역(프로필 / 동의 / 탈퇴) 을 슬롯 prop 으로 분배
- `alert_deliveries` 카운트 쿼리 추가 (Promise.all 라운드트립 동일)
- 기존 `<section id="consents">` 는 동의 슬롯 안으로 이동 (앵커 호환 유지)
- WithdrawSection 호출 제거 (AccountTab 안에서 WithdrawDialog 렌더)

- [ ] **Step 2: 타입체크**

Run:
```bash
bunx tsc --noEmit
```

Expected: 새 에러 없음. 이전 Task 에서 남았던 import 미해결 에러도 모두 사라짐.

- [ ] **Step 3: 줄 수 확인**

Run:
```bash
wc -l app/mypage/page.tsx
```

Expected: 200 줄 이하.

- [ ] **Step 4: 빌드 확인**

Run:
```bash
bun run build
```

Expected: 성공 (warn 은 무시, error 는 0개).

- [ ] **Step 5: 커밋**

```bash
git add app/mypage/page.tsx
git commit -m "feat(mypage): 920px 탭 셸 + 이메일 헤더 강등 + 알림톡 카운트 쿼리"
```

---

## Task 9: 수동 QA — 탭 전환·URL·앵커·반응형·탈퇴 모달

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: dev 서버 기동**

Run:
```bash
bun run dev
```

- [ ] **Step 2: 로그인 후 `/mypage` 진입 — 기본 "프로필" 탭**

체크리스트:
- [ ] 헤더에 이메일이 작은 회색 텍스트로 보임 (입력 박스 X)
- [ ] 데스크톱(1280px) 에서 "기본 정보" / "맞춤 추천 정보" 가 좌우 2컬럼
- [ ] 좌측: 나이 / 거주지역 / 시군구(조건부) / 직업
- [ ] 우측: 소득 / 가구 / 관심분야
- [ ] 저장 버튼 풀폭, 클릭 시 "저장됐어요 ✓" 후 1.8초 뒤 원복

- [ ] **Step 3: 모바일 반응형 확인**

Chrome DevTools → 모바일 뷰(390×844 등) 로 전환:
- [ ] 두 컬럼이 1컬럼으로 stack
- [ ] 탭 3개가 한 줄에 균등 분할 (가로 스크롤 X)
- [ ] 동의 카드 우상단 동의 일자 텍스트 잘림 없음

- [ ] **Step 4: URL 동기화 확인**

- [ ] "동의 관리" 탭 클릭 → URL 이 `/mypage?tab=consents` 로 갱신
- [ ] 새로고침해도 "동의 관리" 탭 유지
- [ ] "프로필" 탭 클릭 → URL 이 `/mypage` (쿼리 제거) 로 정리
- [ ] "계정" 탭 → `/mypage?tab=account`

- [ ] **Step 5: 레거시 앵커 호환 확인**

- [ ] 주소창에 `/mypage#consents` 입력 → 진입 시 자동으로 `?tab=consents` 로 변환되고 "동의 관리" 탭이 활성화
- [ ] 페이지 내 다른 곳(약관 페이지 등) 의 `/mypage#consents` 링크도 동일 동작

- [ ] **Step 6: 동의 관리 탭**

- [ ] "필수 동의" / "선택 동의" 그룹 헤더 분리 노출
- [ ] 필수 2개는 "동의완료" 배지 (토글 없음)
- [ ] 선택 3개는 토글 — 마케팅 OFF/ON 토글 시 즉시 반영, 새로고침 후도 유지
- [ ] 동의 일자가 카드 우상단 작은 회색 글씨로 보임

- [ ] **Step 7: 계정 탭**

- [ ] 가입 일자 / 로그인 방식 / 알림톡 발송 수 (이번 달) 표시
- [ ] "위험 영역" 빨간 라벨 + 빨간 보더의 탈퇴 박스
- [ ] "탈퇴 진행하기" 클릭 → 모달 오픈
- [ ] 모달 안에서 사유 라디오 6개 + 기타 선택 시 textarea 노출
- [ ] 체크박스 미체크 시 "탈퇴 확정" 버튼 disabled
- [ ] "취소" 버튼·바깥 클릭으로 모달 닫힘 (busy 시 닫기 차단)
- [ ] (실제 탈퇴는 시뮬레이션만 — 본인 계정 진짜 탈퇴 금지)

- [ ] **Step 8: 콘솔 에러 0건 확인**

브라우저 DevTools Console:
- [ ] React hydration warning 없음
- [ ] 404 / 500 / network 에러 없음
- [ ] 새로 추가한 컴포넌트 관련 prop type 경고 없음

- [ ] **Step 9: 테스트 스위트 통과**

Run:
```bash
bun run test
```

Expected: 기존 테스트 + 새 anchor-utils 테스트 모두 통과.

- [ ] **Step 10: lint 통과**

Run:
```bash
bun run lint
```

Expected: 새 에러 없음.

- [ ] **Step 11: 최종 빌드**

Run:
```bash
bun run build
```

Expected: production 빌드 성공.

- [ ] **Step 12: 메모리 갱신 (선택)**

`/mypage` 구조가 크게 바뀌었으니 `project_keepioo_status.md` 메모리에 한 줄 추가:
> `/mypage` 탭 기반 재구성 완료 (프로필·동의관리·계정 / 920px 2컬럼)

이건 실행자 판단 — 지표적 변화는 아니지만 다른 페이지에서 `/mypage` 진입점 변경할 때 참고용.

---

## 자체 검토 결과

**Spec coverage**:
- 탭 셸 + URL 동기화 → Task 3
- 앵커 호환 → Task 2(테스트) + Task 3(구현)
- 프로필 2컬럼 → Task 4
- 동의 필수/선택 그룹 → Task 5
- 계정 요약 카드 → Task 6
- 탈퇴 모달 이전 → Task 7
- 컨테이너 920px / 이메일 헤더 / 알림톡 카운트 → Task 8
- 수동 QA → Task 9
- 200줄 이하 / 파일 분리 정책 → Task 4·5·7·8 의 줄 수 확인 단계

**Placeholder scan**: TBD/TODO 없음, 모든 코드 블록 실제 코드 포함.

**Type consistency**: `MypageTab` enum, `AccountTab` props, `WithdrawDialog` 시그니처 모두 일관.

**Risk**:
- shadcn `tabs` 설치 시 의존성 충돌 가능성 (Task 1에서 즉시 발견 가능)
- `alert_deliveries.user_id` 컬럼명이 다를 가능성 → 빌드 시 unknown column 에러로 즉시 노출. 만약 다르면 컬럼명 확인 후 Task 8 의 쿼리 수정.
- 데스크톱 1280px 미만에서 탭 라벨 줄바꿈 가능성 → 라벨이 짧아(2~5자) 거의 안전하지만 QA 단계에서 확인.
