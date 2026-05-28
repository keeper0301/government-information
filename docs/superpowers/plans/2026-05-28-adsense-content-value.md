# AdSense 자체 콘텐츠 가치 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo 자체 콘텐츠 가치를 세 영역(정책 상세 AI 가치 박스·blog 본문 강화·/help 시나리오)에서 끌어올려 AdSense 4번째 거절을 차단한다.

**Architecture:** 세 영역은 독립 entry/data path. 영역 1 은 신규 DB 컬럼 + AI 백필 endpoint + SSR 컴포넌트, 영역 2 는 기존 Gemini prompt(lib/ai.ts)·길이 상수(lib/blog-publish.ts) 강화, 영역 3 은 정적 /help 섹션 추가. 영역 1 의 전체 백필은 sample 10건 사장님 검수 게이트 후 진행.

**Tech Stack:** Next.js(App Router), Supabase(Postgres), OpenAI gpt-4o-mini(`lib/llm/text.ts callLLM`), Gemini(`lib/ai.ts`, blog 전용), vitest.

> **spec 정정 메모:** spec(영역 2)은 길이 임계치를 `quality-gate.ts 1,500→2,500` 으로 적었으나 실제 길이 상수는 `lib/blog-publish.ts:40-41` 의 `MIN_CONTENT_LENGTH=1000`·`MAX_CONTENT_LENGTH=3000`. MAX 가 3000 이라 목표 4,000자 본문은 reject 되므로 MAX 상향이 필수. `quality-gate.ts` 는 외부 채널 발행 승인 게이트(길이 무관)라 손대지 않음. blog prompt 도 OpenAI 아닌 Gemini(`lib/ai.ts`).

---

## File Structure

```
영역 1 — 정책 상세 AI 가치 박스:
  Create — supabase/migrations/104_policy_ai_guides.sql   (welfare/loan 에 ai_tips/ai_faq/ai_checklist TEXT)
  Create — lib/policy/ai-guide.ts                         (prompt 빌드 + callLLM + sanitize)
  Create — __tests__/lib/policy/ai-guide.test.ts
  Create — app/api/admin/backfill-policy-ai-guides/route.ts (requireAdminUser + idempotent batch)
  Create — __tests__/app/backfill-policy-ai-guides-route.test.ts
  Create — components/policy/PolicyGuideBox.tsx           (SSR, null 시 template fallback)
  Create — __tests__/components/policy-guide-box.test.tsx
  Modify — app/welfare/[id]/page.tsx                      (unique_insight 섹션 다음 Box 통합)
  Modify — app/loan/[id]/page.tsx

영역 2 — blog 본문 강화:
  Modify — lib/ai.ts                                      (SYSTEM_INSTRUCTION_BODY 4 구조 + 분량)
  Modify — lib/blog-publish.ts:40-41                      (MIN 1000→2000, MAX 3000→4500)

영역 3 — /help 시나리오:
  Modify — app/help/page.tsx                              (SECTIONS 에 "상황별 이용 가이드" 추가)
```

---

## Task 1: 마이그레이션 — policy_ai_guides 컬럼

**Files:**
- Create: `supabase/migrations/104_policy_ai_guides.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- ============================================================
-- 104: 정책 상세 자체 가치 박스용 AI 가이드 컬럼
-- ============================================================
-- 목적: welfare/loan 상세 11K 페이지에 「이용 팁」「자주 묻는 거절 사유」
-- 「신청 체크리스트」 자체 콘텐츠를 담는다. AdSense "가치 콘텐츠" 강화.
-- NULL = 백필 미완료 → PolicyGuideBox 가 template fallback.

ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS ai_tips TEXT,
  ADD COLUMN IF NOT EXISTS ai_faq TEXT,
  ADD COLUMN IF NOT EXISTS ai_checklist TEXT;

ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS ai_tips TEXT,
  ADD COLUMN IF NOT EXISTS ai_faq TEXT,
  ADD COLUMN IF NOT EXISTS ai_checklist TEXT;

COMMENT ON COLUMN welfare_programs.ai_tips IS 'AI 생성 이용 팁 (자체 콘텐츠). NULL=미백필.';
COMMENT ON COLUMN welfare_programs.ai_faq IS 'AI 생성 자주 묻는 거절 사유. NULL=미백필.';
COMMENT ON COLUMN welfare_programs.ai_checklist IS 'AI 생성 신청 체크리스트. NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_tips IS 'AI 생성 이용 팁 (자체 콘텐츠). NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_faq IS 'AI 생성 자주 묻는 거절 사유. NULL=미백필.';
COMMENT ON COLUMN loan_programs.ai_checklist IS 'AI 생성 신청 체크리스트. NULL=미백필.';
```

- [ ] **Step 2: prod apply (사장님 명시 승인 필요)**

`.env.local` 의 `SUPABASE_ACCESS_TOKEN` + `scripts/apply-migration.mjs` 패턴 사용 (메모리 reference_supabase_management_api).
사장님께 "마이그레이션 104 apply 승인" 명시 표현 받은 뒤 실행. (메모리 feedback_prod_ddl_explicit_approval — "ok" 같은 일반 답 거부, "승인"/"apply" 명시 필요.)

Run: `node scripts/apply-migration.mjs supabase/migrations/104_policy_ai_guides.sql`
Expected: 6 컬럼 추가 성공, 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/104_policy_ai_guides.sql
git commit -m "feat(db): policy_ai_guides 컬럼 — 정책 상세 자체 가치 박스용 (104)"
```

---

## Task 2: lib/policy/ai-guide.ts — AI 가이드 생성 helper

**Files:**
- Create: `lib/policy/ai-guide.ts`
- Test: `__tests__/lib/policy/ai-guide.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/lib/policy/ai-guide.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock("@/lib/llm/text", () => ({
  callLLM: mocks.callLLM,
  parseJSONResponse: (raw: string) => {
    try { return JSON.parse(raw); } catch { return null; }
  },
}));

import { generatePolicyGuide, buildPolicyGuidePrompt } from "@/lib/policy/ai-guide";

describe("buildPolicyGuidePrompt", () => {
  it("정책 제목·카테고리를 prompt 에 담는다", () => {
    const p = buildPolicyGuidePrompt({
      title: "청년 월세 지원",
      summary: "저소득 청년 월세 보조",
      category: "주거",
      target: "청년",
    });
    expect(p).toContain("청년 월세 지원");
    expect(p).toContain("주거");
    expect(p).toContain("JSON");
  });
});

describe("generatePolicyGuide", () => {
  beforeEach(() => mocks.callLLM.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("LLM JSON 응답을 tips/faq/checklist 로 정리한다", async () => {
    mocks.callLLM.mockResolvedValueOnce(
      JSON.stringify({
        tips: "신청 전 소득 기준을 먼저 확인하면 시간을 아낄 수 있습니다.",
        faq: "서류 누락이 가장 흔한 탈락 사유입니다.",
        checklist: "주민등록등본, 임대차계약서, 소득증빙을 준비하세요.",
      }),
    );
    const g = await generatePolicyGuide({
      title: "청년 월세 지원", summary: null, category: "주거", target: "청년",
    });
    expect(g.tips).toContain("소득 기준");
    expect(g.faq).toContain("서류 누락");
    expect(g.checklist).toContain("임대차계약서");
  });

  it("HTML 태그를 제거하고 한국어 없는 값은 null 로 만든다", async () => {
    mocks.callLLM.mockResolvedValueOnce(
      JSON.stringify({
        tips: "<p>소득 기준을 먼저 확인하세요. 충분히 긴 한국어 문장입니다.</p>",
        faq: "ENGLISH ONLY NO KOREAN 12345 abcde",
        checklist: "짧음",
      }),
    );
    const g = await generatePolicyGuide({
      title: "x", summary: null, category: null, target: null,
    });
    expect(g.tips).not.toContain("<p>");
    expect(g.tips).toContain("소득 기준");
    expect(g.faq).toBeNull();       // 한국어 없음
    expect(g.checklist).toBeNull(); // 10자 미만
  });

  it("LLM 이 잘못된 JSON 을 주면 모두 null", async () => {
    mocks.callLLM.mockResolvedValueOnce("not json at all");
    const g = await generatePolicyGuide({
      title: "x", summary: null, category: null, target: null,
    });
    expect(g).toEqual({ tips: null, faq: null, checklist: null });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/lib/policy/ai-guide.test.ts`
Expected: FAIL — "Cannot find module '@/lib/policy/ai-guide'"

- [ ] **Step 3: 구현 작성**

```typescript
// lib/policy/ai-guide.ts
// ============================================================
// 정책 상세 자체 가치 박스용 AI 가이드 생성
// ============================================================
// welfare/loan 정책 메타데이터로 「이용 팁」「자주 묻는 거절 사유」
// 「신청 체크리스트」 3 필드를 OpenAI gpt-4o-mini 로 생성한다.
// 결과는 sanitize 후 DB 컬럼(ai_tips/ai_faq/ai_checklist)에 백필.
// ============================================================

import { callLLM, parseJSONResponse } from "@/lib/llm/text";

export type PolicyGuideInput = {
  title: string;
  summary: string | null;
  category: string | null;
  target: string | null;
};

export type PolicyAiGuide = {
  tips: string | null;
  faq: string | null;
  checklist: string | null;
};

// HTML 제거·공백 정리·한국어 검증·길이 cap. 부적합하면 null.
function sanitize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 10) return null;
  if (!/[가-힣]/.test(cleaned)) return null;
  return cleaned.slice(0, 400);
}

export function buildPolicyGuidePrompt(input: PolicyGuideInput): string {
  return `당신은 한국 정부 지원 정책을 쉽게 안내하는 작가입니다.
아래 정책에 대해 신청자에게 실질적으로 도움이 되는 안내를 작성하세요.

[정책 정보]
- 제목: ${input.title}
- 요약: ${input.summary ?? "(없음)"}
- 분류: ${input.category ?? "(없음)"}
- 대상: ${input.target ?? "(없음)"}

[작성 규칙]
- 원문을 그대로 복사하지 말고 자기 표현으로 풀어쓰세요.
- 각 항목은 1~2문장, 100~200자 한국어로 작성하세요.
- 확실하지 않은 구체 숫자는 지어내지 마세요.

[출력 형식] 아래 JSON 만 출력:
{
  "tips": "이 정책을 활용하면 좋은 경우와 실용 팁",
  "faq": "신청 시 자주 발생하는 거절 사유·주의점",
  "checklist": "신청 전 확인해야 할 항목"
}`;
}

export async function generatePolicyGuide(
  input: PolicyGuideInput,
): Promise<PolicyAiGuide> {
  const raw = await callLLM({
    prompt: buildPolicyGuidePrompt(input),
    maxTokens: 600,
    jsonMode: true,
  });
  const parsed = parseJSONResponse<{
    tips?: string;
    faq?: string;
    checklist?: string;
  }>(raw);
  return {
    tips: sanitize(parsed?.tips),
    faq: sanitize(parsed?.faq),
    checklist: sanitize(parsed?.checklist),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/lib/policy/ai-guide.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/policy/ai-guide.ts __tests__/lib/policy/ai-guide.test.ts
git commit -m "feat(policy): AI 가이드 생성 helper (tips/faq/checklist + sanitize)"
```

---

## Task 3: backfill endpoint

**Files:**
- Create: `app/api/admin/backfill-policy-ai-guides/route.ts`
- Test: `__tests__/app/backfill-policy-ai-guides-route.test.ts`

본보기: `app/api/admin/backfill-district/route.ts` (requireAdminUser + batch + Promise.all chunk).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/app/backfill-policy-ai-guides-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  generatePolicyGuide: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  update: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/admin-auth-server", () => ({
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("@/lib/policy/ai-guide", () => ({
  generatePolicyGuide: mocks.generatePolicyGuide,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        or: () => ({
          limit: async () => ({ data: mocks.rows, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.update(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { POST } from "@/app/api/admin/backfill-policy-ai-guides/route";

function request(body: unknown) {
  return new Request("https://www.keepioo.com/api/admin/backfill-policy-ai-guides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("backfill-policy-ai-guides POST", () => {
  beforeEach(() => {
    mocks.requireAdminUser.mockReset();
    mocks.generatePolicyGuide.mockReset();
    mocks.update.mockClear();
    mocks.rows = [];
  });

  it("미인증이면 401", async () => {
    mocks.requireAdminUser.mockResolvedValueOnce(null);
    const res = await POST(request({ type: "welfare", limit: 5 }));
    expect(res.status).toBe(401);
  });

  it("NULL row 를 생성 결과로 update 한다", async () => {
    mocks.requireAdminUser.mockResolvedValueOnce({ email: "admin@x.com" });
    mocks.rows = [
      { id: "p1", title: "청년 월세", summary: null, category: "주거", target: "청년" },
    ];
    mocks.generatePolicyGuide.mockResolvedValueOnce({
      tips: "팁 내용", faq: "거절 사유", checklist: "체크리스트",
    });
    const res = await POST(request({ type: "welfare", limit: 5 }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.welfare.updated).toBe(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ ai_tips: "팁 내용", ai_faq: "거절 사유", ai_checklist: "체크리스트" }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/app/backfill-policy-ai-guides-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 작성**

```typescript
// app/api/admin/backfill-policy-ai-guides/route.ts
// ============================================================
// 정책 상세 자체 가치 박스 백필 — 사장님 수동 trigger
// ============================================================
// ai_tips/ai_faq/ai_checklist 중 하나라도 NULL 인 row 만 대상 (idempotent).
// limit 파라미터로 sample 검수 (예: limit=10) 후 전체 백필.
// ============================================================

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePolicyGuide } from "@/lib/policy/ai-guide";

export const maxDuration = 60;

type PolicyRow = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  target: string | null;
};

async function backfillTable(
  table: "welfare_programs" | "loan_programs",
  limit: number,
): Promise<{ table: string; updated: number; skipped: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .select("id, title, summary, category, target")
    .or("ai_tips.is.null,ai_faq.is.null,ai_checklist.is.null")
    .limit(limit);

  if (error || !data) return { table, updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;
  // 4건씩 직렬 chunk — OpenAI rate limit 마진.
  const CHUNK = 4;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK) as PolicyRow[];
    await Promise.all(
      chunk.map(async (row) => {
        const guide = await generatePolicyGuide({
          title: row.title,
          summary: row.summary,
          category: row.category,
          target: row.target,
        });
        if (!guide.tips && !guide.faq && !guide.checklist) {
          skipped += 1;
          return;
        }
        const { error: upErr } = await admin
          .from(table)
          .update({
            ai_tips: guide.tips,
            ai_faq: guide.faq,
            ai_checklist: guide.checklist,
          })
          .eq("id", row.id);
        if (upErr) skipped += 1;
        else updated += 1;
      }),
    );
  }
  return { table, updated, skipped };
}

export async function POST(req: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = body.type === "welfare" || body.type === "loan" ? body.type : "both";
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 2000);

  const result: Record<string, unknown> = { ok: true };
  if (type === "welfare" || type === "both") {
    result.welfare = await backfillTable("welfare_programs", limit);
  }
  if (type === "loan" || type === "both") {
    result.loan = await backfillTable("loan_programs", limit);
  }
  return NextResponse.json(result);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/app/backfill-policy-ai-guides-route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/backfill-policy-ai-guides/route.ts __tests__/app/backfill-policy-ai-guides-route.test.ts
git commit -m "feat(api): policy ai-guide 백필 endpoint (requireAdminUser + idempotent batch)"
```

---

## Task 4: PolicyGuideBox 컴포넌트

**Files:**
- Create: `components/policy/PolicyGuideBox.tsx`
- Test: `__tests__/components/policy-guide-box.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// __tests__/components/policy-guide-box.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";

describe("PolicyGuideBox", () => {
  it("3 필드가 있으면 세 섹션을 모두 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox
        tips="신청 전 소득을 확인하세요"
        faq="서류 누락이 흔한 거절 사유"
        checklist="등본·계약서·소득증빙"
        category="주거"
      />,
    );
    expect(html).toContain("신청 전 소득");
    expect(html).toContain("서류 누락");
    expect(html).toContain("등본");
  });

  it("모두 null 이면 template fallback 안내를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox tips={null} faq={null} checklist={null} category="주거" />,
    );
    // fallback 은 일반 안내 문구 — 본문은 비지 않음
    expect(html.length).toBeGreaterThan(50);
    expect(html).toContain("공식");
  });

  it("일부 필드만 있으면 있는 섹션만 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox tips="팁만 있음" faq={null} checklist={null} />,
    );
    expect(html).toContain("팁만 있음");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/components/policy-guide-box.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 작성**

```tsx
// components/policy/PolicyGuideBox.tsx
// ============================================================
// 정책 상세 자체 가치 박스 — keepioo 자체 작성 콘텐츠
// ============================================================
// ai_tips/ai_faq/ai_checklist 가 있으면 3 섹션 렌더.
// 모두 NULL 이면 template fallback (자체 가치 0 보다 나음).
// ============================================================

type Props = {
  tips: string | null;
  faq: string | null;
  checklist: string | null;
  category?: string | null;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[14px] font-bold text-grey-900 mb-1">{label}</div>
      <div className="text-[14px] text-grey-800 leading-[1.7] whitespace-pre-line">
        {value}
      </div>
    </div>
  );
}

export function PolicyGuideBox({ tips, faq, checklist, category }: Props) {
  const hasAny = Boolean(tips || faq || checklist);

  return (
    <section className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-8 mb-6 max-md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.3px]">
          신청 전에 알아두면 좋은 점
        </h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          keepioo 안내
        </span>
      </div>

      {hasAny ? (
        <>
          {tips && <Row label="이용 팁" value={tips} />}
          {faq && <Row label="자주 묻는 거절 사유" value={faq} />}
          {checklist && <Row label="신청 체크리스트" value={checklist} />}
        </>
      ) : (
        <div className="text-[14px] text-grey-800 leading-[1.7]">
          {category ? `${category} ` : ""}지원 정책은 대상 조건·마감일·필요 서류를
          미리 확인하면 신청이 수월합니다. 신청 자격과 제출 서류는 아래 공고 내용에서
          확인하고, 최종 신청·확인은 공식 사이트에서 진행해 주세요.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/components/policy-guide-box.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/policy/PolicyGuideBox.tsx __tests__/components/policy-guide-box.test.tsx
git commit -m "feat(policy): PolicyGuideBox SSR 컴포넌트 (3 섹션 + template fallback)"
```

---

## Task 5: welfare/loan 상세 페이지 통합

**Files:**
- Modify: `app/welfare/[id]/page.tsx` (unique_insight 섹션 직후, 라인 282 이후)
- Modify: `app/loan/[id]/page.tsx` (동일 위치)

테스트 없음 — SSR 통합. typecheck + 수동 검증으로 확인.

- [ ] **Step 1: welfare import + 렌더 추가**

`app/welfare/[id]/page.tsx` 상단 import 블록에 추가:
```tsx
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";
```

라인 282 `unique_insight` 섹션의 닫는 `)}` **직후**, `{/* Description ... */}` 직전에 추가:
```tsx
      {/* keepioo 자체 가치 박스 — AI 생성 팁/거절 사유/체크리스트.
          백필 전 row 는 3 필드 NULL → template fallback. */}
      <PolicyGuideBox
        tips={program.ai_tips}
        faq={program.ai_faq}
        checklist={program.ai_checklist}
        category={program.category}
      />
```

- [ ] **Step 2: loan 동일 적용**

`app/loan/[id]/page.tsx` 에 동일 import + `unique_insight` 섹션(라인 286 부근) 직후 같은 JSX 추가.

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`program.ai_tips` 등이 `select("*")` 로 자동 포함 — Step 1 마이그레이션 후 database.types 재생성이 안 됐다면 `program` 타입에 ai_* 없을 수 있음. 그 경우 select 가 `*` 라 런타임은 정상이나 타입 에러 → `program.ai_tips ?? null` 로 우회하거나 database.types 재생성. 우회 우선.)

만약 타입 에러 발생 시 JSX 를 다음으로 교체:
```tsx
      <PolicyGuideBox
        tips={(program as { ai_tips?: string | null }).ai_tips ?? null}
        faq={(program as { ai_faq?: string | null }).ai_faq ?? null}
        checklist={(program as { ai_checklist?: string | null }).ai_checklist ?? null}
        category={program.category}
      />
```

- [ ] **Step 4: Commit**

```bash
git add app/welfare/[id]/page.tsx app/loan/[id]/page.tsx
git commit -m "feat(policy): welfare/loan 상세에 PolicyGuideBox 통합"
```

---

## Task 6: blog 본문 강화 (prompt + 길이 상수)

**Files:**
- Modify: `lib/ai.ts` (`SYSTEM_INSTRUCTION_BODY`, 라인 156~)
- Modify: `lib/blog-publish.ts:40-41` (`MIN_CONTENT_LENGTH`, `MAX_CONTENT_LENGTH`)
- Test: `__tests__/lib/blog-publish-length.test.ts` (길이 상수 가드)

- [ ] **Step 1: 길이 상수 가드 테스트 작성**

본문 길이 검증은 `publishWithCandidate` 내부라 단위 테스트가 무겁다. 대신 상수 값 자체를 export 해 가드한다.
먼저 `lib/blog-publish.ts:40-41` 의 상수에 `export` 를 붙인다 (값은 Step 2 에서 변경):
```typescript
export const MIN_CONTENT_LENGTH = 1000; // Step 2 에서 2000 으로
export const MAX_CONTENT_LENGTH = 3000; // Step 2 에서 4500 으로
```

```typescript
// __tests__/lib/blog-publish-length.test.ts
import { describe, it, expect } from "vitest";
import { MIN_CONTENT_LENGTH, MAX_CONTENT_LENGTH } from "@/lib/blog-publish";

describe("blog 본문 길이 임계치", () => {
  it("최소 2,000자 이상으로 상향됐다", () => {
    expect(MIN_CONTENT_LENGTH).toBeGreaterThanOrEqual(2000);
  });
  it("최대치는 목표 4,000자를 reject 하지 않는다", () => {
    expect(MAX_CONTENT_LENGTH).toBeGreaterThanOrEqual(4000);
  });
});
```

- [ ] **Step 2: 길이 상수 변경**

`lib/blog-publish.ts:40-41`:
```typescript
export const MIN_CONTENT_LENGTH = 2000; // 1000 → 2000 (자체 콘텐츠 깊이 ↑)
export const MAX_CONTENT_LENGTH = 4500; // 3000 → 4500 (목표 3,000~4,000자 수용)
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npx vitest run __tests__/lib/blog-publish-length.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: prompt 4 구조 + 분량 지시 추가**

`lib/ai.ts` 의 `SYSTEM_INSTRUCTION_BODY` 문자열 안 "## 글의 목적" 블록 끝(라인 160 부근, "- 데이터 출처..." 다음)에 분량·구조 블록을 추가:
```
- 분량: 본문 2,000~4,000자(공백 제외). 얕은 요약 금지, 신청자가 끝까지 읽을 깊이.

## 본문 4 구조 (반드시 이 순서·이 4개 H2 골격 포함)
1. 도입 — 이 정책이 왜 중요한지 + 정의 문장 (위 GEO 규칙 적용)
2. 누가·언제 — 적용 시나리오 (구체 대상·상황 예시, 단 가짜 개인사례 금지)
3. 신청 체크리스트 — 신청 전 준비물·확인 항목을 목록으로
4. 공식 원문 확인 — 신청자가 공식 사이트에서 꼭 재확인할 항목
```
(기존 GEO 질문형 H2 규칙과 충돌하지 않음 — 4 구조는 골격, 질문형 H2 는 그 안에서 사용.)

- [ ] **Step 5: typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

```bash
git add lib/ai.ts lib/blog-publish.ts __tests__/lib/blog-publish-length.test.ts
git commit -m "feat(blog): 본문 4 구조 prompt + 길이 2,000~4,500자 상향"
```

---

## Task 7: /help 시나리오 가이드 3종

**Files:**
- Modify: `app/help/page.tsx` (`SECTIONS` 배열, 라인 41~248)

테스트 없음 — 정적 콘텐츠. typecheck + 수동 확인.

- [ ] **Step 1: SECTIONS 에 새 섹션 추가**

`SECTIONS` 배열의 첫 섹션("서비스 소개") **앞** 또는 "맞춤 알림" 섹션 **뒤** 에 추가 (FAQPage JSON-LD 자동 포함):
```tsx
  {
    title: "상황별 이용 가이드",
    items: [
      {
        q: "처음 사용하는데 어떻게 시작하나요?",
        a: (
          <>
            ① 무료 회원가입 → ② 마이페이지에서 나이·지역·관심 분야를 입력 →
            ③ 홈과 <Link href="/recommend" className="text-blue-500 hover:underline">맞춤 추천</Link>에서
            나에게 맞는 정책을 받아보세요. 마감 임박 정책은 알림으로도 알려드려요.
          </>
        ),
      },
      {
        q: "60대 부모님 대신 신청 정보를 찾고 싶어요",
        a: (
          <>
            <Link href="/quiz" className="text-blue-500 hover:underline">1분 진단</Link>에서
            부모님의 나이·지역·상황을 입력하면 해당되는 복지·지원 정책을 모아 보여드려요.
            각 정책 상세에서 신청 조건과 마감일을 확인하고, 실제 신청은 안내된 공식
            사이트에서 진행하시면 됩니다.
          </>
        ),
      },
      {
        q: "소상공인인데 받을 수 있는 지원이 궁금해요",
        a: (
          <>
            마이페이지에 업종·사업 정보를 입력하면{" "}
            <Link href="/loan" className="text-blue-500 hover:underline">대출·지원금</Link> 영역에서
            자격 진단 배지(받을 수 있음/조건 확인)와 함께 맞는 정책을 추려드려요.
            마감 임박 공고는 알림으로 놓치지 않게 안내합니다.
          </>
        ),
      },
    ],
  },
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/help/page.tsx
git commit -m "feat(help): 상황별 이용 가이드 3종 (처음·부모님 대신·소상공인)"
```

---

## Task 8: 전체 검증 + 백필 실행

- [ ] **Step 1: 전체 typecheck + test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck 에러 0, 전체 test fail 0 (신규 테스트 포함).

- [ ] **Step 2: push**

```bash
git push origin master
```

- [ ] **Step 3: sample 백필 (검증 게이트)**

배포 완료 후 사장님 로그인 세션으로 sample 10건 호출 (welfare):
```bash
# 사장님 브라우저 콘솔 또는 인증 쿠키 포함 요청
fetch("/api/admin/backfill-policy-ai-guides", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "welfare", limit: 10 }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ ok: true, welfare: { updated: ~10, skipped: 0~ } }`

- [ ] **Step 4: 사장님 sample 검수 게이트**

welfare 상세 페이지 10건에서 PolicyGuideBox 노출·내용 품질 확인.
품질 미흡 시 `buildPolicyGuidePrompt` 조정 후 재실행. **사장님 명시 승인 전 전체 백필 금지.**

- [ ] **Step 5: 전체 백필 (사장님 승인 후)**

```bash
# limit 없이 (기본 50 → 반복 호출) 또는 limit=2000 으로 여러 번
fetch("/api/admin/backfill-policy-ai-guides", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "both", limit: 2000 }),
}).then(r => r.json()).then(console.log)
```
idempotent 라 NULL row 소진까지 반복. 11K 완료까지 약 50분.

- [ ] **Step 6: prod 검증**

- welfare/loan 상세 10건 PolicyGuideBox 노출
- blog 다음 발행분 2,000자+ (cron 후 /blog 확인)
- /help 시나리오 3종 노출

---

## Self-Review (작성 후 점검 결과)

- **Spec coverage:** 영역 1(Task 1~5)·영역 2(Task 6)·영역 3(Task 7)·검증 게이트(Task 8) 모두 매핑됨.
- **Placeholder scan:** 모든 step 에 실제 코드·명령·기대결과 포함. "적절히 처리" 류 없음.
- **Type consistency:** `PolicyAiGuide{tips,faq,checklist}` 가 Task2 정의 → Task3 update payload(`ai_tips/ai_faq/ai_checklist`) → Task4 props(`tips/faq/checklist`) → Task5 JSX(`program.ai_*`) 일관. `callLLM`/`parseJSONResponse` signature 는 Explore 확인값과 일치.
- **spec 정정 반영:** blog 길이 상수 위치(blog-publish.ts)·MAX 상향·Gemini(lib/ai.ts) 모두 plan 에 정확 반영.
