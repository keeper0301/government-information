# 광역 보도자료 L2 자동 confirm — 신뢰도 tier + 회수 메커니즘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo 광역 보도자료 자동 등록에 신뢰도 tier (high/mid/low) 추가 + 사장님 1클릭 회수 메커니즘 + 자동 등록·회수 가시성 통합.

**Architecture:** 기존 `autoConfirmPendingPressCandidates` (apply_url 기반) 위에 confidence_tier 차원 추가. `low` 만 pending 큐 보존, 나머지는 자동 등록. welfare/loan 에 `is_hidden`+`revoked_at`/`by` 컬럼 추가 (news_posts 028 패턴) + RLS 갱신으로 회수 시 즉시 사용자 노출 차단. 회수 진입점 2개 (전용 페이지 + 정책 상세 배지) + 알림 4 채널 (평소 0 / 매일 SMS / health-alert / 주간 digest).

**Tech Stack:** Next.js 16 App Router · Supabase Postgres · Anthropic Claude Haiku · Resend · Solapi SMS · Vitest

**Spec:** `docs/superpowers/specs/2026-05-08-press-ingest-confidence-tier-design.md`

---

## File Structure

| 파일 | 역할 | Create / Modify |
|---|---|---|
| `supabase/migrations/077_press_confidence_tier.sql` | DDL: confidence_tier · auto_confirm_tier · auto_confirmed_at · is_hidden · revoked_at/by + RLS + 인덱스 | Create |
| `lib/press-ingest/classify.ts` | LLM 응답에 confidence 필드 + prompt 보강 | Modify |
| `lib/press-ingest/candidates.ts` | tier 분기 + auto_confirm_tier 메타데이터 + revokeAutoConfirmed 함수 | Modify |
| `lib/press-ingest/ingest.ts` | autoConfirm 호출부 — auto_confirm_tier 인자 전달 | Modify |
| `lib/admin-actions.ts` | enum `press_l2_auto_revoke`, `press_l2_auto_restore` 추가 | Modify |
| `lib/health-check.ts` | `pressLowTierBacklog` 신호 + 임계치 + recommendation | Modify |
| `app/admin/auto-confirmed/page.tsx` | 신규 운영 모음 페이지 | Create |
| `app/admin/auto-confirmed/actions.ts` | 회수·복원 server action | Create |
| `app/admin/auto-confirmed/components.tsx` | 카드·필터·일괄 선택 UI | Create |
| `components/admin/auto-confirm-badge.tsx` | 정책 상세에 들어가는 배지 + 버튼 | Create |
| `app/admin/welfare/[id]/page.tsx`, `app/admin/loan/[id]/page.tsx` | 배지 컴포넌트 노출 | Modify |
| `lib/admin/menu.ts` | "AI 자동 등록 검수" 메뉴 추가 | Modify |
| `lib/notifications/daily-digest.ts` | 자동 등록 1줄 통합 (24h 자동 등록 N건 / 회수 M건 / low 큐 K건) | Modify |
| `lib/notifications/weekly-ops-digest.ts` | 주간 자동 등록·회수율·tier 분포 1 섹션 | Modify |
| `__tests__/lib/press-ingest/classify-confidence.test.ts` | confidence fallback 테스트 | Create |
| `__tests__/lib/press-ingest/auto-confirm-tier.test.ts` | tier 분기 + AUTO_CONFIRM_TIER_FLOOR env 테스트 | Create |
| `__tests__/lib/press-ingest/revoke.test.ts` | 회수 server action 테스트 | Create |
| `__tests__/lib/health-check.test.ts` | low tier 임계치 테스트 추가 | Modify |

---

## Task 1: DDL 077 마이그레이션 작성 + 로컬 적용

**Files:**
- Create: `supabase/migrations/077_press_confidence_tier.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 077: 광역 보도자료 L2 자동 confirm 신뢰도 tier + 회수 메커니즘
--
-- spec: docs/superpowers/specs/2026-05-08-press-ingest-confidence-tier-design.md
--
-- 1) press_ingest_candidates 에 confidence_tier 추가 + status enum 'revoked' 확장
-- 2) welfare_programs / loan_programs 양쪽에 자동 등록 메타 + soft hide + 회수 audit 컬럼
-- 3) RLS 갱신 — 028 news_posts 패턴 (USING (is_hidden = false))
-- 4) 인덱스 — 자동 등록 최근 N일 조회 + 사용자 노출 partial index

-- ─── press_ingest_candidates ────────────────────────────────
ALTER TABLE public.press_ingest_candidates
  ADD COLUMN IF NOT EXISTS confidence_tier TEXT
    CHECK (confidence_tier IS NULL OR confidence_tier IN ('high', 'mid', 'low'));

ALTER TABLE public.press_ingest_candidates
  DROP CONSTRAINT IF EXISTS press_ingest_candidates_status_check;
ALTER TABLE public.press_ingest_candidates
  ADD CONSTRAINT press_ingest_candidates_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'skipped', 'failed', 'revoked'));

-- ─── welfare_programs ──────────────────────────────────────
ALTER TABLE public.welfare_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── loan_programs ─────────────────────────────────────────
ALTER TABLE public.loan_programs
  ADD COLUMN IF NOT EXISTS auto_confirm_tier TEXT
    CHECK (auto_confirm_tier IS NULL OR auto_confirm_tier IN ('high', 'mid')),
  ADD COLUMN IF NOT EXISTS auto_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── RLS 갱신 (028 패턴) ─────────────────────────────────
DROP POLICY IF EXISTS "welfare_programs_read" ON public.welfare_programs;
CREATE POLICY "welfare_programs_read"
  ON public.welfare_programs FOR SELECT
  USING (is_hidden = false);

DROP POLICY IF EXISTS "loan_programs_read" ON public.loan_programs;
CREATE POLICY "loan_programs_read"
  ON public.loan_programs FOR SELECT
  USING (is_hidden = false);

-- ─── 인덱스 ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_welfare_auto_confirmed_at
  ON public.welfare_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loan_auto_confirmed_at
  ON public.loan_programs(auto_confirmed_at DESC)
  WHERE auto_confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_welfare_visible
  ON public.welfare_programs(created_at DESC)
  WHERE is_hidden = false;

CREATE INDEX IF NOT EXISTS idx_loan_visible
  ON public.loan_programs(created_at DESC)
  WHERE is_hidden = false;

-- ─── 코멘트 ───────────────────────────────────────────────
COMMENT ON COLUMN public.press_ingest_candidates.confidence_tier IS
  'LLM 분류 신뢰도 (high/mid/low). high+mid 자동 confirm, low 만 pending 큐 보존. AUTO_CONFIRM_TIER_FLOOR env 로 toggle.';
COMMENT ON COLUMN public.welfare_programs.auto_confirm_tier IS
  '자동 등록된 정책의 LLM 신뢰도. NULL = 수동 등록 또는 legacy 자동 등록 (077 이전).';
COMMENT ON COLUMN public.welfare_programs.is_hidden IS
  'soft hide. RLS 가 USING(is_hidden=false) 라 사용자 노출 즉시 차단. service_role 우회.';
```

- [ ] **Step 2: 로컬 supabase 에 적용 (있는 경우)**

Run: `npx supabase db push --linked` (linked 환경) 또는 사장님 환경엔 local supabase 없으니 skip.

**참고**: prod apply 는 사장님 명시 승인 후 별도 진행 (Task 11). 이 step 은 로컬 dev 환경 검증 용.

- [ ] **Step 3: 마이그레이션 파일 commit**

```bash
git add supabase/migrations/077_press_confidence_tier.sql
git commit -m "feat(press-ingest): DDL 077 — confidence_tier + auto_confirm_tier + is_hidden + revoked_at"
```

---

## Task 2: classify.ts — confidence 필드 + prompt 보강 (TDD)

**Files:**
- Modify: `lib/press-ingest/classify.ts`
- Create: `__tests__/lib/press-ingest/classify-confidence.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`__tests__/lib/press-ingest/classify-confidence.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// classifyPressNews 가 fetch 를 직접 호출 — fetch mock 으로 LLM 응답 시뮬레이션
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

import { classifyPressNews } from "@/lib/press-ingest/classify";

function mockLlmResponse(json: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }),
  });
}

describe("classifyPressNews — confidence tier", () => {
  it("LLM 이 confidence='high' 응답하면 그대로 보존", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
      target: "",
      eligibility: "",
      benefits: "",
      apply_method: "",
      apply_url: "https://welfare.seoul.go.kr/x",
      body_urls: [],
      apply_start: null,
      apply_end: null,
      category: "주거",
      confidence: "high",
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("high");
  });

  it("LLM 이 confidence 누락하면 'low' fallback (보수적)", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
      target: "",
      eligibility: "",
      benefits: "",
      apply_method: "",
      apply_url: null,
      body_urls: [],
      apply_start: null,
      apply_end: null,
      category: "주거",
      // confidence 누락
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("low");
  });

  it("LLM 이 invalid confidence 값 응답하면 'low' fallback", async () => {
    mockLlmResponse({
      is_policy: true,
      program_type: "welfare",
      title: "x",
      target: "",
      eligibility: "",
      benefits: "",
      apply_method: "",
      apply_url: null,
      body_urls: [],
      apply_start: null,
      apply_end: null,
      category: "주거",
      confidence: "very-high", // invalid
    });
    const r = await classifyPressNews({ title: "t", summary: null, body: null });
    expect(r.confidence).toBe("low");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run __tests__/lib/press-ingest/classify-confidence.test.ts`
Expected: FAIL — `r.confidence` undefined (필드 자체 없음)

- [ ] **Step 3: ClassifyResult 에 confidence 필드 추가**

`lib/press-ingest/classify.ts` 의 `ClassifyResult` type 수정:

```typescript
export type ClassifyResult = {
  is_policy: boolean;
  program_type: "welfare" | "loan" | "unsure";
  // ... 기존 필드 ...
  /**
   * LLM 분류 신뢰도 — high/mid/low 3단.
   * - high: 신청 자격·금액·기간 모두 명시 + 확실한 정책 사업
   * - mid: 일부 정보 누락 또는 modal verb ("지원할 예정")
   * - low: 본문이 짧거나 광고·이벤트 가능성 → 사장님 검토 큐
   *
   * AUTO_CONFIRM_TIER_FLOOR env (default 'mid') 가 자동 confirm 임계.
   * LLM 응답 누락·invalid 시 'low' fallback (보수적).
   */
  confidence: "high" | "mid" | "low";
  // ... 기존 필드 ...
};
```

- [ ] **Step 4: prompt 보강 — confidence 응답 지시**

`PROMPT_TEMPLATE` 의 JSON 형식 부분에 confidence 추가:

```
JSON 형식 (다른 말 없이 JSON 만 출력):
{
  ...,
  "category": "...",
  "confidence": "high|mid|low (분류 신뢰도)",
  ...
}

confidence 판단 기준:
- high: 보도자료에 신청 자격·지원 금액·신청 기간이 모두 명시되고, "정책 사업" 임이 확실
- mid: 일부 정보 누락 또는 "지원할 예정"·"검토 중" 같은 modal verb 가 사용됨
- low: 본문이 짧거나 행사·이벤트·광고 가능성이 있어 사람 검토 필요
```

- [ ] **Step 5: classifyPressNews 응답 파싱에 fallback 추가**

`return { ... }` 부분 수정:

```typescript
const allowedConfidence: ReadonlyArray<"high" | "mid" | "low"> = ["high", "mid", "low"];
const confidence: "high" | "mid" | "low" =
  typeof parsed.confidence === "string" &&
  (allowedConfidence as readonly string[]).includes(parsed.confidence)
    ? (parsed.confidence as "high" | "mid" | "low")
    : "low"; // 누락·invalid → 보수적 low

return {
  // ... 기존 필드 ...
  confidence,
  // ... 기존 필드 ...
};
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `npx vitest run __tests__/lib/press-ingest/classify-confidence.test.ts`
Expected: PASS (3/3)

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (단, `candidates.ts` 의 다른 사용처에서 `confidence` 필드 강제로 throw 가능성 — 모두 새 필드라 type narrowing 영향 없음)

- [ ] **Step 8: commit**

```bash
git add lib/press-ingest/classify.ts __tests__/lib/press-ingest/classify-confidence.test.ts
git commit -m "feat(press-ingest): classify.ts confidence tier (high/mid/low) + low fallback"
```

---

## Task 3: candidates.ts — tier 분기 + revokeAutoConfirmed (TDD)

**Files:**
- Modify: `lib/press-ingest/candidates.ts`
- Modify: `lib/admin-actions.ts`
- Create: `__tests__/lib/press-ingest/auto-confirm-tier.test.ts`

- [ ] **Step 1: lib/admin-actions.ts 에 새 enum 추가**

`AdminActionType` union 에 추가:

```typescript
  | "dedupe_reject"
  | "health_alert_run"
  | "press_l2_auto_revoke"      // 자동 등록 정책 회수 (is_hidden=true)
  | "press_l2_auto_restore";    // 잘못 회수한 정책 복원 (is_hidden=false)
```

`ACTION_LABELS` 에 한국어 라벨:

```typescript
  press_l2_auto_revoke: "자동 등록 정책 회수",
  press_l2_auto_restore: "자동 등록 정책 복원",
```

- [ ] **Step 2: PressCandidateStatus 에 'revoked' 추가**

`lib/press-ingest/candidates.ts` 의 union type:

```typescript
export type PressCandidateStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "skipped"
  | "failed"
  | "revoked"; // 자동 등록 후 사장님이 회수한 상태
```

- [ ] **Step 3: 실패 테스트 작성 — auto-confirm-tier.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// classifyStatus 는 export 안 된 internal — 테스트 위해 candidates 모듈 from 직접 가져옴.
// pure function 이라 DB mock 불필요.
import { buildCandidateUpsert } from "@/lib/press-ingest/candidates";
import type { ClassifyResult } from "@/lib/press-ingest/classify";

function makeResult(overrides: Partial<ClassifyResult>): ClassifyResult {
  return {
    is_policy: true,
    program_type: "welfare",
    title: "test",
    target: "",
    eligibility: "",
    benefits: "",
    apply_method: "",
    apply_url: "https://welfare.seoul.go.kr/x",
    body_urls: [],
    apply_start: null,
    apply_end: null,
    category: "주거",
    confidence: "high",
    ...overrides,
  };
}

describe("buildCandidateUpsert — confidence_tier 보존", () => {
  it("welfare + high → status='pending', confidence_tier='high'", () => {
    const upsert = buildCandidateUpsert({ newsId: "n1", result: makeResult({ confidence: "high" }) });
    expect(upsert.status).toBe("pending");
    expect(upsert.program_type).toBe("welfare");
    expect(upsert.confidence_tier).toBe("high");
  });

  it("loan + mid → status='pending', confidence_tier='mid'", () => {
    const upsert = buildCandidateUpsert({
      newsId: "n2",
      result: makeResult({ program_type: "loan", confidence: "mid" }),
    });
    expect(upsert.confidence_tier).toBe("mid");
  });

  it("welfare + low → status='pending', confidence_tier='low' (autoConfirm 분기 입력)", () => {
    const upsert = buildCandidateUpsert({ newsId: "n3", result: makeResult({ confidence: "low" }) });
    expect(upsert.status).toBe("pending");
    expect(upsert.confidence_tier).toBe("low");
  });

  it("is_policy=false → status='skipped', confidence_tier=null (자동 confirm 대상 X)", () => {
    const upsert = buildCandidateUpsert({ newsId: "n4", result: makeResult({ is_policy: false }) });
    expect(upsert.status).toBe("skipped");
    expect(upsert.confidence_tier).toBeNull();
  });
});
```

- [ ] **Step 4: 테스트 실행 — 실패 확인**

Run: `npx vitest run __tests__/lib/press-ingest/auto-confirm-tier.test.ts`
Expected: FAIL — `confidence_tier` 필드가 PressCandidateUpsert 에 없음

- [ ] **Step 5: PressCandidateUpsert 에 confidence_tier 추가**

`lib/press-ingest/candidates.ts`:

```typescript
export type PressCandidateUpsert = {
  news_id: string;
  status: PressCandidateStatus;
  program_type: PressCandidateProgramType;
  title: string;
  category: string | null;
  classified_payload: ClassifyResult;
  skip_reason: string | null;
  error_message?: string | null;
  classified_at: string;
  updated_at: string;
  confidence_tier: "high" | "mid" | "low" | null;  // 추가 — is_policy=false 시 null
};
```

- [ ] **Step 6: classifyStatus + buildCandidateUpsert 가 confidence_tier 반환**

```typescript
function classifyStatus(result: ClassifyResult): {
  status: PressCandidateStatus;
  programType: PressCandidateProgramType;
  skipReason: string | null;
  confidenceTier: "high" | "mid" | "low" | null;
} {
  if (!result.is_policy) {
    return { status: "skipped", programType: "not_policy", skipReason: "not_policy", confidenceTier: null };
  }
  if (result.program_type === "welfare" || result.program_type === "loan") {
    return {
      status: "pending",
      programType: result.program_type,
      skipReason: null,
      confidenceTier: result.confidence,
    };
  }
  return { status: "skipped", programType: "unsure", skipReason: "program_type_unsure", confidenceTier: null };
}

export function buildCandidateUpsert({
  newsId,
  result,
}: { newsId: string; result: ClassifyResult }): PressCandidateUpsert {
  const { status, programType, skipReason, confidenceTier } = classifyStatus(result);
  const now = new Date().toISOString();
  return {
    news_id: newsId,
    status,
    program_type: programType,
    title: result.title,
    category: result.category || null,
    classified_payload: result,
    skip_reason: skipReason,
    error_message: null,
    classified_at: now,
    updated_at: now,
    confidence_tier: confidenceTier,
  };
}
```

`buildFailedCandidateUpsert` 에도 `confidence_tier: null` 추가.

- [ ] **Step 7: 테스트 실행 — 통과 확인**

Run: `npx vitest run __tests__/lib/press-ingest/auto-confirm-tier.test.ts`
Expected: PASS (4/4)

- [ ] **Step 8: commit**

```bash
git add lib/press-ingest/candidates.ts lib/admin-actions.ts __tests__/lib/press-ingest/auto-confirm-tier.test.ts
git commit -m "feat(press-ingest): candidates.ts confidence_tier 보존 + revoke enum"
```

---

## Task 4: autoConfirm tier filter + AUTO_CONFIRM_TIER_FLOOR env (TDD)

**Files:**
- Modify: `lib/press-ingest/candidates.ts` (autoConfirmPendingPressCandidates)
- Modify: `lib/press-ingest/ingest.ts` (auto_confirm_tier 메타데이터 INSERT 시)
- Modify: `__tests__/lib/press-ingest/auto-confirm-tier.test.ts`

- [ ] **Step 1: TIER_RANK 헬퍼 + tier 필터 테스트 추가**

`__tests__/lib/press-ingest/auto-confirm-tier.test.ts` 끝에 추가:

```typescript
import { shouldAutoConfirm } from "@/lib/press-ingest/candidates";

describe("shouldAutoConfirm — tier 분기 + AUTO_CONFIRM_TIER_FLOOR env", () => {
  it("default floor='mid' → high/mid 자동, low pending", () => {
    delete process.env.AUTO_CONFIRM_TIER_FLOOR;
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("floor='high' → high 만 자동", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "high";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(false);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("floor='low' → 모두 자동 (적극 모드)", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "low";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(true);
  });

  it("invalid floor 값 → default 'mid' fallback", () => {
    process.env.AUTO_CONFIRM_TIER_FLOOR = "extreme";
    expect(shouldAutoConfirm("high")).toBe(true);
    expect(shouldAutoConfirm("mid")).toBe(true);
    expect(shouldAutoConfirm("low")).toBe(false);
  });

  it("confidence_tier=null (legacy 후보) → 자동 confirm X (보수적)", () => {
    delete process.env.AUTO_CONFIRM_TIER_FLOOR;
    expect(shouldAutoConfirm(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run __tests__/lib/press-ingest/auto-confirm-tier.test.ts`
Expected: FAIL — `shouldAutoConfirm` 가 export 안 됨

- [ ] **Step 3: shouldAutoConfirm 헬퍼 export**

`lib/press-ingest/candidates.ts` 에 추가:

```typescript
const TIER_RANK = { high: 3, mid: 2, low: 1 } as const;

/**
 * AUTO_CONFIRM_TIER_FLOOR env 기반 자동 confirm 분기.
 * default 'mid' (high+mid 자동 confirm, low pending). invalid 값 → 'mid' fallback.
 * tier=null (legacy) → false (자동 confirm X).
 */
export function shouldAutoConfirm(tier: "high" | "mid" | "low" | null): boolean {
  if (tier === null) return false;
  const raw = process.env.AUTO_CONFIRM_TIER_FLOOR ?? "mid";
  const floor = (["high", "mid", "low"] as const).includes(raw as "high" | "mid" | "low")
    ? (raw as "high" | "mid" | "low")
    : "mid";
  return TIER_RANK[tier] >= TIER_RANK[floor];
}
```

- [ ] **Step 4: autoConfirmPendingPressCandidates 가 tier 기반 분기**

기존 함수 안에서 `for (const row of ...)` 루프 시작 부분에:

```typescript
for (const row of ((data ?? []) as unknown as AutoConfirmRow[])) {
  // 신뢰도 tier 분기 — low (또는 floor 미만) 은 pending 유지
  const tier = (row.confidence_tier ?? null) as "high" | "mid" | "low" | null;
  if (!shouldAutoConfirm(tier)) {
    continue; // pending 큐에 유지 — 사장님 검토 대상
  }
  // ... 기존 apply_url fallback 로직 ...
```

또한 select 에 `confidence_tier` 추가:

```typescript
.select(
  "id, classified_payload, confidence_tier, news_posts!inner(id, slug, ministry, body)",
)
```

`AutoConfirmRow` type 에 `confidence_tier` 추가.

- [ ] **Step 5: confirmPressCandidate 가 auto_confirm_tier 메타 INSERT**

`buildWelfareInsertPayload` / `buildLoanInsertPayload` 에 인자 추가:

```typescript
export function buildWelfareInsertPayload(
  candidate: PressCandidateForConfirm,
  options?: { autoConfirmTier?: "high" | "mid" | null },
) {
  requirePending(candidate, "welfare");
  const result = candidate.classified_payload;
  return {
    // ... 기존 필드 ...
    auto_confirm_tier: options?.autoConfirmTier ?? null,
    auto_confirmed_at: options?.autoConfirmTier ? new Date().toISOString() : null,
    // ...extractTags(result),
  };
}
```

`confirmPressCandidate` 시그니처 확장:

```typescript
export async function confirmPressCandidate(
  candidateId: string,
  actorId: string | null,
  options?: { autoConfirmTier?: "high" | "mid" | null },
): Promise<{ table: "welfare_programs" | "loan_programs"; id: string }> {
```

`autoConfirmPendingPressCandidates` 안의 호출:

```typescript
await confirmPressCandidate(row.id, null, {
  autoConfirmTier: tier === "high" || tier === "mid" ? tier : null,
});
```

- [ ] **Step 6: PressCandidateForConfirm 에 confidence_tier 노출**

`getPressCandidateForConfirm` 의 select 에 confidence_tier 추가 + return type 확장.

- [ ] **Step 7: 테스트 실행 — 통과 확인**

Run: `npx vitest run __tests__/lib/press-ingest/auto-confirm-tier.test.ts`
Expected: PASS (9/9 — 4 + 5)

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: commit**

```bash
git add lib/press-ingest/candidates.ts __tests__/lib/press-ingest/auto-confirm-tier.test.ts
git commit -m "feat(press-ingest): autoConfirm tier filter + auto_confirm_tier 메타 INSERT"
```

---

## Task 5: revokeAutoConfirmed / restoreAutoConfirmed server action (TDD)

**Files:**
- Modify: `lib/press-ingest/candidates.ts`
- Create: `__tests__/lib/press-ingest/revoke.test.ts`

- [ ] **Step 1: 회수 함수 시그니처 + 테스트 작성**

`__tests__/lib/press-ingest/revoke.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildRevokePayload, buildRestorePayload } from "@/lib/press-ingest/candidates";

describe("buildRevokePayload — 회수 시점 데이터 생성 (pure)", () => {
  it("welfare 회수 payload 는 is_hidden=true + revoked_at + revoked_by", () => {
    const before = Date.now();
    const payload = buildRevokePayload({ actorId: "u1" });
    expect(payload.is_hidden).toBe(true);
    expect(payload.revoked_by).toBe("u1");
    expect(new Date(payload.revoked_at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("system 회수 (actorId=null) 도 가능 — revoked_by=null", () => {
    const payload = buildRevokePayload({ actorId: null });
    expect(payload.revoked_by).toBeNull();
  });
});

describe("buildRestorePayload — 복원 시점 데이터 생성 (pure)", () => {
  it("복원 payload 는 is_hidden=false + revoked_at=null + revoked_by=null", () => {
    const payload = buildRestorePayload();
    expect(payload.is_hidden).toBe(false);
    expect(payload.revoked_at).toBeNull();
    expect(payload.revoked_by).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run __tests__/lib/press-ingest/revoke.test.ts`
Expected: FAIL — `buildRevokePayload` export 안 됨

- [ ] **Step 3: pure helper 함수 export**

`lib/press-ingest/candidates.ts` 에 추가:

```typescript
export type RevokePayload = {
  is_hidden: true;
  revoked_at: string;
  revoked_by: string | null;
  updated_at: string;
};

export function buildRevokePayload({ actorId }: { actorId: string | null }): RevokePayload {
  const now = new Date().toISOString();
  return {
    is_hidden: true,
    revoked_at: now,
    revoked_by: actorId,
    updated_at: now,
  };
}

export type RestorePayload = {
  is_hidden: false;
  revoked_at: null;
  revoked_by: null;
  updated_at: string;
};

export function buildRestorePayload(): RestorePayload {
  return {
    is_hidden: false,
    revoked_at: null,
    revoked_by: null,
    updated_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: revokeAutoConfirmed server-side 함수 추가**

```typescript
/**
 * 자동 등록된 정책 회수 — welfare/loan row 의 is_hidden=true + revoked_at/by 토글.
 * candidate status='revoked' 로 이동 + admin_actions.press_l2_auto_revoke audit.
 *
 * actorId=null 이면 system 회수 (예: cron 자동 회수, 미래 가능). 사장님 회수는 actorId=auth user.
 */
export async function revokeAutoConfirmed({
  candidateId,
  actorId,
}: {
  candidateId: string;
  actorId: string | null;
}): Promise<{ table: "welfare_programs" | "loan_programs"; programId: string }> {
  const admin = createAdminClient();

  // candidate 조회 — confirmed_program_table·confirmed_program_id 로 정확히 row 찾음
  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select(
      "id, status, confirmed_program_table, confirmed_program_id, confidence_tier",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`회수 후보 조회 실패: ${error.message}`);
  if (!data) throw new Error("후보를 찾을 수 없습니다.");
  if (data.status !== "confirmed") {
    throw new Error(`회수는 confirmed 상태만 가능합니다 (현재: ${data.status}).`);
  }
  if (!data.confirmed_program_table || !data.confirmed_program_id) {
    throw new Error("등록된 정책 정보가 없는 후보입니다.");
  }

  const table = data.confirmed_program_table as "welfare_programs" | "loan_programs";
  const programId = data.confirmed_program_id as string;

  // welfare/loan row toggle
  const revoke = buildRevokePayload({ actorId });
  const { error: hideErr } = await admin.from(table).update(revoke).eq("id", programId);
  if (hideErr) throw new Error(`정책 hidden 토글 실패: ${hideErr.message}`);

  // candidate status → 'revoked'
  const { error: candErr } = await admin
    .from("press_ingest_candidates")
    .update({ status: "revoked", updated_at: revoke.updated_at })
    .eq("id", candidateId);
  if (candErr) throw new Error(`후보 상태 갱신 실패: ${candErr.message}`);

  // audit
  await logAdminAction({
    actorId,
    action: "press_l2_auto_revoke",
    details: {
      candidate_id: candidateId,
      table,
      program_id: programId,
      auto_confirm_tier: data.confidence_tier,
    },
  });

  return { table, programId };
}

/**
 * 잘못 회수한 정책 복원 — is_hidden=false + revoked_at/by null + candidate status='confirmed'.
 */
export async function restoreAutoConfirmed({
  candidateId,
  actorId,
}: {
  candidateId: string;
  actorId: string | null;
}): Promise<{ table: "welfare_programs" | "loan_programs"; programId: string }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("press_ingest_candidates")
    .select("id, status, confirmed_program_table, confirmed_program_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`복원 후보 조회 실패: ${error.message}`);
  if (!data) throw new Error("후보를 찾을 수 없습니다.");
  if (data.status !== "revoked") {
    throw new Error(`복원은 revoked 상태만 가능합니다 (현재: ${data.status}).`);
  }
  if (!data.confirmed_program_table || !data.confirmed_program_id) {
    throw new Error("등록된 정책 정보가 없는 후보입니다.");
  }

  const table = data.confirmed_program_table as "welfare_programs" | "loan_programs";
  const programId = data.confirmed_program_id as string;
  const restore = buildRestorePayload();

  const { error: hideErr } = await admin.from(table).update(restore).eq("id", programId);
  if (hideErr) throw new Error(`정책 복원 토글 실패: ${hideErr.message}`);

  const { error: candErr } = await admin
    .from("press_ingest_candidates")
    .update({ status: "confirmed", updated_at: restore.updated_at })
    .eq("id", candidateId);
  if (candErr) throw new Error(`후보 상태 갱신 실패: ${candErr.message}`);

  await logAdminAction({
    actorId,
    action: "press_l2_auto_restore",
    details: { candidate_id: candidateId, table, program_id: programId },
  });

  return { table, programId };
}
```

- [ ] **Step 5: 테스트 실행 — pure helper 통과 확인**

Run: `npx vitest run __tests__/lib/press-ingest/revoke.test.ts`
Expected: PASS (3/3)

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: commit**

```bash
git add lib/press-ingest/candidates.ts __tests__/lib/press-ingest/revoke.test.ts
git commit -m "feat(press-ingest): revokeAutoConfirmed + restoreAutoConfirmed server fn + admin audit"
```

---

## Task 6: /admin/auto-confirmed 페이지

**Files:**
- Create: `app/admin/auto-confirmed/page.tsx`
- Create: `app/admin/auto-confirmed/actions.ts`
- Create: `app/admin/auto-confirmed/components.tsx`
- Modify: `lib/admin/menu.ts`

- [ ] **Step 1: server action 작성**

`app/admin/auto-confirmed/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { revokeAutoConfirmed, restoreAutoConfirmed } from "@/lib/press-ingest/candidates";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) throw new Error("권한 없음");
  return user;
}

export async function revokeAction(candidateId: string) {
  const user = await requireAdmin();
  const result = await revokeAutoConfirmed({ candidateId, actorId: user.id });
  revalidatePath("/admin/auto-confirmed");
  return result;
}

export async function restoreAction(candidateId: string) {
  const user = await requireAdmin();
  const result = await restoreAutoConfirmed({ candidateId, actorId: user.id });
  revalidatePath("/admin/auto-confirmed");
  return result;
}

export async function bulkRevokeAction(candidateIds: string[]) {
  const user = await requireAdmin();
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of candidateIds) {
    try {
      await revokeAutoConfirmed({ candidateId: id, actorId: user.id });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  revalidatePath("/admin/auto-confirmed");
  return results;
}
```

- [ ] **Step 2: 데이터 fetch helper — lib/press-ingest/candidates.ts**

```typescript
export type AutoConfirmedRow = {
  candidate_id: string;
  table: "welfare_programs" | "loan_programs";
  program_id: string;
  title: string;
  ministry: string | null;
  auto_confirm_tier: "high" | "mid";
  auto_confirmed_at: string;
  is_hidden: boolean;
  revoked_at: string | null;
};

/** /admin/auto-confirmed 페이지용 — N일 안 자동 등록 + revoked 모두 포함 */
export async function listAutoConfirmedPolicies({
  sinceDays,
}: { sinceDays: number }): Promise<AutoConfirmedRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  // welfare + loan 양쪽에서 auto_confirmed_at 채워진 row 조회
  const [welfare, loan] = await Promise.all([
    admin
      .from("welfare_programs")
      .select("id, title, region, auto_confirm_tier, auto_confirmed_at, is_hidden, revoked_at")
      .gte("auto_confirmed_at", since)
      .order("auto_confirmed_at", { ascending: false }),
    admin
      .from("loan_programs")
      .select("id, title, source, auto_confirm_tier, auto_confirmed_at, is_hidden, revoked_at")
      .gte("auto_confirmed_at", since)
      .order("auto_confirmed_at", { ascending: false }),
  ]);

  // candidate id 매핑 — confirmed_program_id 로 join
  const programIds = [
    ...(welfare.data ?? []).map((r) => r.id),
    ...(loan.data ?? []).map((r) => r.id),
  ];
  if (programIds.length === 0) return [];

  const { data: candidates } = await admin
    .from("press_ingest_candidates")
    .select("id, confirmed_program_id, confirmed_program_table")
    .in("confirmed_program_id", programIds);

  const candByProgramId = new Map<string, string>();
  for (const c of candidates ?? []) {
    if (c.confirmed_program_id) candByProgramId.set(c.confirmed_program_id, c.id);
  }

  const rows: AutoConfirmedRow[] = [];
  for (const w of welfare.data ?? []) {
    const cid = candByProgramId.get(w.id);
    if (!cid) continue;
    rows.push({
      candidate_id: cid,
      table: "welfare_programs",
      program_id: w.id,
      title: w.title,
      ministry: w.region ?? null,
      auto_confirm_tier: w.auto_confirm_tier as "high" | "mid",
      auto_confirmed_at: w.auto_confirmed_at,
      is_hidden: w.is_hidden,
      revoked_at: w.revoked_at,
    });
  }
  for (const l of loan.data ?? []) {
    const cid = candByProgramId.get(l.id);
    if (!cid) continue;
    rows.push({
      candidate_id: cid,
      table: "loan_programs",
      program_id: l.id,
      title: l.title,
      ministry: l.source ?? null,
      auto_confirm_tier: l.auto_confirm_tier as "high" | "mid",
      auto_confirmed_at: l.auto_confirmed_at,
      is_hidden: l.is_hidden,
      revoked_at: l.revoked_at,
    });
  }
  rows.sort((a, b) => b.auto_confirmed_at.localeCompare(a.auto_confirmed_at));
  return rows;
}
```

- [ ] **Step 3: page.tsx — 서버 컴포넌트 + 필터**

```typescript
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { listAutoConfirmedPolicies } from "@/lib/press-ingest/candidates";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AutoConfirmedList } from "./components";

export const metadata: Metadata = {
  title: "AI 자동 등록 검수 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/auto-confirmed");
  if (!isAdminUser(user.email)) redirect("/");

  const params = await searchParams;
  const days = Math.max(1, Math.min(30, Number(params.days ?? "3")));
  const rows = await listAutoConfirmedPolicies({ sinceDays: days });

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · AI 자동 등록"
        title="자동 등록 정책 검수"
        description="LLM 신뢰도 high·mid 로 자동 등록된 정책. 잘못된 분류 1클릭 회수 + 복원."
      />
      <AutoConfirmedList rows={rows} days={days} />
    </div>
  );
}
```

- [ ] **Step 4: components.tsx — 클라이언트 컴포넌트**

```typescript
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { revokeAction, restoreAction, bulkRevokeAction } from "./actions";
import type { AutoConfirmedRow } from "@/lib/press-ingest/candidates";

export function AutoConfirmedList({
  rows,
  days,
}: {
  rows: AutoConfirmedRow[];
  days: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const onToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const onRevokeOne = (id: string) =>
    startTransition(async () => {
      await revokeAction(id);
    });
  const onRestoreOne = (id: string) =>
    startTransition(async () => {
      await restoreAction(id);
    });
  const onBulkRevoke = () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}건 회수합니다. 진행할까요?`)) return;
    startTransition(async () => {
      await bulkRevokeAction([...selected]);
      setSelected(new Set());
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {[1, 3, 7, 30].map((d) => (
          <Link
            key={d}
            href={`?days=${d}`}
            className={`text-sm px-3 py-1.5 rounded-full border ${
              d === days
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-grey-700 border-grey-200"
            }`}
          >
            최근 {d}일
          </Link>
        ))}
        <div className="ml-auto text-xs text-grey-600">
          총 {rows.length}건 (선택 {selected.size})
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onBulkRevoke}
            disabled={pending}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            선택 회수
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-grey-600">자동 등록된 정책 없음.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.candidate_id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                r.is_hidden ? "border-red-200 bg-red-50" : "border-grey-200 bg-white"
              }`}
            >
              {!r.is_hidden && (
                <input
                  type="checkbox"
                  checked={selected.has(r.candidate_id)}
                  onChange={() => onToggle(r.candidate_id)}
                  className="mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-grey-600 mb-1">
                  <span className={`px-1.5 py-0.5 rounded ${
                    r.auto_confirm_tier === "high" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    🤖 {r.auto_confirm_tier}
                  </span>
                  <span>{r.table === "welfare_programs" ? "복지" : "대출"}</span>
                  <span>·</span>
                  <span>{r.ministry ?? "—"}</span>
                  <span>·</span>
                  <span>{new Date(r.auto_confirmed_at).toLocaleString("ko-KR")}</span>
                  {r.is_hidden && (
                    <span className="text-red-600 font-semibold">회수됨</span>
                  )}
                </div>
                <Link
                  href={`/admin/${r.table === "welfare_programs" ? "welfare" : "loan"}/${r.program_id}`}
                  className="text-sm font-semibold text-grey-900 hover:underline truncate"
                >
                  {r.title}
                </Link>
              </div>
              {r.is_hidden ? (
                <button
                  type="button"
                  onClick={() => onRestoreOne(r.candidate_id)}
                  disabled={pending}
                  className="text-xs text-blue-600 disabled:opacity-50"
                >
                  복원
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRevokeOne(r.candidate_id)}
                  disabled={pending}
                  className="text-xs text-red-600 disabled:opacity-50"
                >
                  회수
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 사이드 메뉴 등록**

`lib/admin/menu.ts` 의 적절한 그룹 (예: "데이터 관리" 또는 "광역 보도자료") 에 추가:

```typescript
{ href: "/admin/auto-confirmed", label: "AI 자동 등록 검수", icon: "🤖" },
```

기존 menu.ts 의 정확한 패턴은 파일을 읽고 그대로 따름.

- [ ] **Step 6: 타입체크 + 시각 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

(시각 확인은 dev 서버 띄울 수 있으면 — 사장님 환경에선 작업자가 prod deploy 후 확인)

- [ ] **Step 7: commit**

```bash
git add app/admin/auto-confirmed lib/press-ingest/candidates.ts lib/admin/menu.ts
git commit -m "feat(admin): /admin/auto-confirmed 자동 등록 검수 페이지 + 일괄 회수"
```

---

## Task 7: 정책 상세 페이지에 자동 등록 배지 + 회수 버튼

**Files:**
- Create: `components/admin/auto-confirm-badge.tsx`
- Modify: `app/admin/welfare/[id]/page.tsx`
- Modify: `app/admin/loan/[id]/page.tsx`

- [ ] **Step 1: 배지 컴포넌트 작성**

`components/admin/auto-confirm-badge.tsx`:

```typescript
"use client";

import { useTransition } from "react";
import { revokeAction, restoreAction } from "@/app/admin/auto-confirmed/actions";

export function AutoConfirmBadge({
  candidateId,
  tier,
  isHidden,
  autoConfirmedAt,
}: {
  candidateId: string | null;
  tier: "high" | "mid" | null;
  isHidden: boolean;
  autoConfirmedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  if (!candidateId || !tier) return null;

  const tierColor = tier === "high" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${
      isHidden ? "border-red-200 bg-red-50" : "border-grey-200 bg-grey-50"
    }`}>
      <span className={`text-xs px-1.5 py-0.5 rounded ${tierColor}`}>🤖 AI {tier}</span>
      <span className="text-xs text-grey-700">
        자동 등록 {autoConfirmedAt ? new Date(autoConfirmedAt).toLocaleString("ko-KR") : "—"}
      </span>
      {isHidden ? (
        <>
          <span className="text-xs text-red-600 font-semibold">회수됨</span>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                if (confirm("이 정책을 복원합니다 (사용자에게 다시 노출)?")) {
                  await restoreAction(candidateId);
                }
              })
            }
            disabled={pending}
            className="text-xs text-blue-600 disabled:opacity-50"
          >
            복원
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              if (confirm("이 정책을 회수합니다 (사용자 노출 즉시 차단)?")) {
                await revokeAction(candidateId);
              }
            })
          }
          disabled={pending}
          className="text-xs text-red-600 disabled:opacity-50"
        >
          회수
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: welfare 상세 페이지에 배지 노출**

`app/admin/welfare/[id]/page.tsx` 안 — welfare row fetch 시 `auto_confirm_tier`, `auto_confirmed_at`, `is_hidden` 추가 select. candidate id 도 1 query 로 join (Task 6 의 candByProgramId 패턴 재사용).

배지 위치: 페이지 상단 헤더 아래.

```typescript
import { AutoConfirmBadge } from "@/components/admin/auto-confirm-badge";

// ... 기존 fetch 후 ...
{program.auto_confirm_tier && (
  <AutoConfirmBadge
    candidateId={candidateId}
    tier={program.auto_confirm_tier as "high" | "mid"}
    isHidden={program.is_hidden}
    autoConfirmedAt={program.auto_confirmed_at}
  />
)}
```

- [ ] **Step 3: loan 상세 페이지에 동일 패턴**

같은 코드, table 만 `loan_programs` 로.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: commit**

```bash
git add components/admin/auto-confirm-badge.tsx app/admin/welfare/[id] app/admin/loan/[id]
git commit -m "feat(admin): 정책 상세에 자동 등록 배지 + 회수/복원 버튼"
```

---

## Task 8: health-alert 통합 — low tier 적체 임계치 (TDD)

**Files:**
- Modify: `lib/health-check.ts`
- Modify: `__tests__/lib/health-check.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`__tests__/lib/health-check.test.ts` 의 "Phase 1 자동 진단" describe 끝에:

```typescript
describe("checkThresholds — Phase 1 추가: press_low_tier_backlog", () => {
  const ACTIVE: HealthSignals = { ...BASE_SIGNALS, signups24h: 5, active7dAny: 10 };

  it("low tier 큐 10+ → press_low_tier alert + recommendation", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLowTierBacklog: 10 });
    const a = alerts.find((x) => x.key === "press_low_tier");
    expect(a).toBeDefined();
    expect(a?.recommendation).toContain("AUTO_CONFIRM_TIER_FLOOR");
  });

  it("low tier 9 → 발화 안 함 (boundary)", () => {
    const alerts = checkThresholds({ ...ACTIVE, pressLowTierBacklog: 9 });
    expect(alerts.find((a) => a.key === "press_low_tier")).toBeUndefined();
  });
});
```

또한 BASE_SIGNALS 에 새 필드 추가:

```typescript
const BASE_SIGNALS: HealthSignals = {
  // ... 기존 ...
  pressLowTierBacklog: 0,
};
```

기존 모든 테스트가 `...BASE_SIGNALS` 스프레드를 쓰므로 추가만으로 통과 유지.

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run __tests__/lib/health-check.test.ts`
Expected: FAIL — `pressLowTierBacklog` 가 HealthSignals 에 없음

- [ ] **Step 3: HealthSignals 에 pressLowTierBacklog 추가**

`lib/health-check.ts`:

```typescript
export type HealthSignals = {
  // ... 기존 ...
  /**
   * press_ingest_candidates 의 confidence_tier='low' + status='pending' 큐 적체.
   * 적극 모드 (high+mid 자동) 채택 후 평소엔 거의 0. 10+ = LLM 신뢰도 하락 신호.
   */
  pressLowTierBacklog: number;
};

const PRESS_LOW_TIER_FLOOR = Number(process.env.PRESS_LOW_TIER_FLOOR ?? "10");
```

- [ ] **Step 4: getHealthSignals 에 쿼리 추가**

```typescript
const { count: lowTierCount } = await sb
  .from("press_ingest_candidates")
  .select("*", { count: "exact", head: true })
  .eq("status", "pending")
  .eq("confidence_tier", "low");
const pressLowTierBacklog = lowTierCount ?? 0;

return {
  // ... 기존 ...
  pressLowTierBacklog,
};
```

- [ ] **Step 5: ThresholdAlert key 와 checkThresholds 분기 추가**

```typescript
export type ThresholdAlert = {
  key:
    | "low_activity"
    | "payment_fail"
    | "cron_fail"
    | "news_backlog"
    | "press_pending"
    | "press_no_show"
    | "press_low_tier"      // 신규
    | "enrich_stuck";
  // ...
};

// checkThresholds 안에 추가:
if (s.pressLowTierBacklog >= PRESS_LOW_TIER_FLOOR) {
  alerts.push({
    key: "press_low_tier",
    message: `LLM 신뢰도 'low' 큐 ${s.pressLowTierBacklog}건 (임계 ${PRESS_LOW_TIER_FLOOR}+).`,
    recommendation:
      "/admin/press-ingest 검토 또는 AUTO_CONFIRM_TIER_FLOOR=low 로 일시 적극화 (위험 감수)",
  });
}
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `npx vitest run __tests__/lib/health-check.test.ts`
Expected: PASS (이전 23 + 새 2 = 25)

- [ ] **Step 7: commit**

```bash
git add lib/health-check.ts __tests__/lib/health-check.test.ts
git commit -m "feat(health-alert): low tier 큐 임계치 통합 (PRESS_LOW_TIER_FLOOR env)"
```

---

## Task 9: daily-digest SMS 에 자동 등록 1줄 통합

**Files:**
- Modify: `lib/notifications/daily-digest.ts`

- [ ] **Step 1: daily-digest 현재 구조 읽기 (작업자 step)**

Run: `cat lib/notifications/daily-digest.ts | head -80`

(작업자가 현재 collectDailyDigest / formatDigestMessage 구조 확인 필요)

- [ ] **Step 2: collectDailyDigest 결과에 자동 등록 카운트 3개 추가**

```typescript
export type DailyDigest = {
  // ... 기존 ...
  autoConfirm24h: number;       // 어제 자동 등록된 정책 수
  autoRevoke24h: number;        // 어제 회수된 정책 수
  pressLowTierBacklog: number;  // 현재 low 큐 적체
};
```

`collectDailyDigest` 함수 안에:

```typescript
const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const [welfareAuto, loanAuto] = await Promise.all([
  admin.from("welfare_programs").select("id", { count: "exact", head: true })
    .gte("auto_confirmed_at", since24h),
  admin.from("loan_programs").select("id", { count: "exact", head: true })
    .gte("auto_confirmed_at", since24h),
]);
const autoConfirm24h = (welfareAuto.count ?? 0) + (loanAuto.count ?? 0);

const { count: revoke24h } = await admin
  .from("admin_actions")
  .select("id", { count: "exact", head: true })
  .eq("action", "press_l2_auto_revoke")
  .gte("created_at", since24h);
const autoRevoke24h = revoke24h ?? 0;

const { count: lowQueue } = await admin
  .from("press_ingest_candidates")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending")
  .eq("confidence_tier", "low");
const pressLowTierBacklog = lowQueue ?? 0;
```

- [ ] **Step 3: formatDigestMessage 에 1줄 추가**

기존 SMS 메시지 본문에:

```typescript
// 자동 등록 가시성 — 평소 0건이면 line 자체 skip (SMS 압축)
const autoLine = digest.autoConfirm24h > 0 || digest.autoRevoke24h > 0
  ? `\nAI 자동 등록 ${digest.autoConfirm24h}건 / 회수 ${digest.autoRevoke24h}건${
      digest.pressLowTierBacklog > 0 ? ` / low 큐 ${digest.pressLowTierBacklog}` : ""
    }`
  : "";
```

`autoLine` 을 SMS 본문 적절 위치에 삽입.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: commit**

```bash
git add lib/notifications/daily-digest.ts
git commit -m "feat(daily-digest): SMS 에 자동 등록·회수·low 큐 1줄 통합"
```

---

## Task 10: weekly-ops-digest 에 자동 등록·회수율 섹션 추가

**Files:**
- Modify: `lib/notifications/weekly-ops-digest.ts`

- [ ] **Step 1: 현재 weekly-ops-digest 구조 읽기**

Run: `cat lib/notifications/weekly-ops-digest.ts | head -100`

(작업자가 buildWeeklyOpsHtml / collectWeeklyOpsDigest 구조 확인)

- [ ] **Step 2: 주간 자동 등록 KPI 추가**

`collectWeeklyOpsDigest` 결과에:

```typescript
type WeeklyAutoKpi = {
  weekAutoConfirm: number;      // 7일 자동 등록
  weekAutoRevoke: number;       // 7일 회수
  weekRevokeRate: number;       // 회수율 % (0~100)
  weekHighCount: number;
  weekMidCount: number;
  weekMidRevokeRate: number;    // mid 회수율 — 5% 초과 시 경고
};
```

`collectWeeklyOpsDigest` 안에서 7d 윈도로 집계 (Task 9 의 24h 패턴을 7d 로 변경).

- [ ] **Step 3: buildWeeklyOpsHtml 에 1 섹션 추가**

```typescript
const autoSection = `
  <h3>AI 자동 등록 (주간)</h3>
  <ul>
    <li>자동 등록 ${kpi.weekAutoConfirm}건 (high ${kpi.weekHighCount} / mid ${kpi.weekMidCount})</li>
    <li>회수 ${kpi.weekAutoRevoke}건 — 회수율 ${kpi.weekRevokeRate}%</li>
    ${kpi.weekMidRevokeRate > 5 ? `<li style="color:red"><strong>⚠ mid 회수율 ${kpi.weekMidRevokeRate}% (>5%) — AUTO_CONFIRM_TIER_FLOOR=high 검토</strong></li>` : ""}
  </ul>
`;
```

text 버전에도 같은 정보 1 섹션.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: commit**

```bash
git add lib/notifications/weekly-ops-digest.ts
git commit -m "feat(weekly-ops): 주간 자동 등록·회수율·tier 분포 섹션 추가"
```

---

## Task 11: prod 마이그레이션 077 적용 (사장님 명시 승인)

**Files:**
- Apply: `supabase/migrations/077_press_confidence_tier.sql` to prod

- [ ] **Step 1: 사장님께 명시 승인 요청**

메시지 예시:
```
DDL 077 prod apply 명시 승인 부탁드립니다.

영향:
- press_ingest_candidates: confidence_tier 컬럼 추가 + status enum 'revoked' 확장
- welfare_programs / loan_programs: auto_confirm_tier · auto_confirmed_at · is_hidden · revoked_at · revoked_by 컬럼 추가
- RLS 갱신 — welfare/loan 의 USING(true) → USING(is_hidden=false). 기존 row default false 라 동일 동작.
- 인덱스 4개 추가

회귀 위험: 0 (nullable 컬럼만 추가, RLS default false 라 visible 그대로). 일시적 락 < 1초 (테이블 큰 경우).

"승인" / "apply" / "테이블 변경 승인" 표현으로 답해주시면 진행합니다.
```

- [ ] **Step 2: 사장님 명시 승인 받은 후 prod apply**

작업자는 supabase MCP 또는 사장님이 콘솔에서 직접 실행. local 에 supabase CLI linked 라면 `npx supabase db push`.

- [ ] **Step 3: apply 후 검증 쿼리**

```sql
-- 컬럼 추가 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'welfare_programs' AND column_name IN ('is_hidden', 'auto_confirm_tier');

-- RLS 정책 확인
SELECT polname, pg_get_expr(polqual, polrelid)
FROM pg_policy WHERE polrelid = 'public.welfare_programs'::regclass;
```

기대: `is_hidden boolean NOT NULL`, `auto_confirm_tier text YES (nullable)`, RLS qual 에 `is_hidden = false` 포함.

- [ ] **Step 4: 사장님께 적용 완료 보고 + 다음 cron 모니터링 안내**

매일 KST 10:30 / 15:30 / 19:30 press-ingest cron 부터 confidence_tier 가 채워지기 시작. 24h 후 /admin/auto-confirmed 에서 첫 자동 등록 검수 가능.

---

## Task 12: 환경변수 등록 + 모니터링 1주차 + 커밋

**Files:**
- Vercel env 추가: `AUTO_CONFIRM_TIER_FLOOR=mid` (default), `PRESS_LOW_TIER_FLOOR=10` (default)

- [ ] **Step 1: Vercel env 등록**

작업자가 Vercel 콘솔에서 추가 (사장님 위임 메모리 — 클로드가 자동 입력):

- `AUTO_CONFIRM_TIER_FLOOR` = `mid` (Production)
- `PRESS_LOW_TIER_FLOOR` = `10` (Production)

env 미설정 시 default 동일 동작이지만 명시 등록 → 사장님이 /admin/health 에서 1줄 toggle 가능.

- [ ] **Step 2: redeploy**

작업자가 Vercel 콘솔 또는 git push 트리거.

- [ ] **Step 3: 1주차 모니터링 가이드 사장님 보고**

- 매일 daily-digest SMS 의 "AI 자동 등록 N건" line 확인
- 매일 /admin/auto-confirmed 에서 신규 등록 검수 (1~3분)
- mid 회수율이 5% 초과면 `AUTO_CONFIRM_TIER_FLOOR=high` 로 1줄 변경 (안전 모드)
- low 큐가 임계 10 초과 시 health-alert SMS 자동 발송

---

## Self-Review

**1. Spec 커버리지 — 9 단계 모두 task 매핑**
- DDL 077 → Task 1 + Task 11 (prod apply)
- classify.ts confidence → Task 2
- candidates.ts tier 분기 → Task 3 + Task 4
- /admin/auto-confirmed → Task 6
- 정책 상세 배지 → Task 7
- health-alert 통합 → Task 8
- 매일 23:00 SMS → Task 9 (daily-digest 통합으로 변경, KST 08:00 발송)
- 주간 digest → Task 10
- 단위 테스트 → Task 2/3/4/5/8 안에 TDD 통합

**2. Placeholder scan**
- 없음 — 모든 코드 step 에 실제 코드 명시

**3. Type consistency**
- `confidence` (classify) ↔ `confidence_tier` (candidates) — DB 컬럼명은 snake_case `confidence_tier`, API/응답 typed `confidence` (high|mid|low). 변환은 buildCandidateUpsert 에서. 일관성 OK.
- `revokeAutoConfirmed` 함수명 모든 task 에서 동일 ✓
- `AutoConfirmedRow` type 모든 사용처에서 동일 ✓

**4. 미해결**
- Task 9/10 의 daily-digest / weekly-ops-digest 정확한 메시지 위치는 작업자가 현재 파일 읽고 결정 (step 1 에서 확인 명시)
- Task 7 의 candidate id 매핑 query — Task 6 의 패턴 재사용 (program.id → candidate.confirmed_program_id 역조회)
