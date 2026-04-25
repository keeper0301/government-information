# 사용자별 맞춤화 Phase 1.5 — 정책 본문 분석 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** welfare + loan 정책 본문을 키워드 사전으로 분석해 income_target_level / household_target_tags 컬럼을 채우고, score.ts 의 정확 매칭으로 전환해 분리 섹션 정확도를 높인다.

**Architecture:** 신규 `lib/personalization/targeting-extract.ts` 키워드 사전 + `app/api/enrich-targeting/route.ts` cron 으로 100건/회 자동 처리. 백필은 admin 페이지의 batch trigger 로 1000건씩. score.ts 가 새 컬럼이 있으면 정확 매칭(+4/+3×일치), 없으면 Phase 1 본문 정규식(+2) fallback.

**Tech Stack:** Next.js App Router (RSC), Supabase Postgres + RLS, TypeScript, Vitest, Vercel Cron.

**참조 spec:** `docs/superpowers/specs/2026-04-25-personalization-phase1-5-design.md` (commit 9ec1d34)

---

## File Structure

### 새로 만드는 파일
```
supabase/migrations/
  └── 043_program_targeting_columns.sql

lib/personalization/
  └── targeting-extract.ts                 # 키워드 사전 + extractTargeting 함수

__tests__/personalization/
  └── targeting-extract.test.ts

app/api/enrich-targeting/
  └── route.ts                             # cron + backfill 옵션 통합

app/admin/targeting/
  └── page.tsx                             # 진행률 지표 + batch trigger
```

### 수정하는 파일
```
lib/database.types.ts                      # WelfareProgram + LoanProgram 에 새 컬럼 3개
lib/personalization/types.ts               # MatchSignal.kind 에 income_target/household_target 추가
lib/personalization/score.ts               # ScorableItem 확장 + 정확 매칭 로직
app/welfare/page.tsx                       # welfareToScorable 에 두 필드
app/loan/page.tsx                          # loanToScorable 에 두 필드
components/home-recommend-auto.tsx         # welfareRowToScorable + select 컬럼 확장
vercel.json                                # /api/enrich-targeting cron 추가
```

---

## Task 1: 마이그레이션 043 + database.types

**Files:**
- Create: `supabase/migrations/043_program_targeting_columns.sql`
- Modify: `lib/database.types.ts`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/043_program_targeting_columns.sql
-- Phase 1.5: 정책 본문 분석으로 채울 자격 컬럼
-- - income_target_level: 정책이 요구하는 소득 수준 (low/mid_low/mid/any/null)
-- - household_target_tags: 정책 대상 가구 유형 배열
-- - last_targeting_analyzed_at: cron 마지막 분석 시각 (NULL=미분석)

ALTER TABLE welfare_programs
  ADD COLUMN IF NOT EXISTS income_target_level TEXT
    CHECK (income_target_level IN ('low','mid_low','mid','any') OR income_target_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_target_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_targeting_analyzed_at TIMESTAMPTZ;

ALTER TABLE loan_programs
  ADD COLUMN IF NOT EXISTS income_target_level TEXT
    CHECK (income_target_level IN ('low','mid_low','mid','any') OR income_target_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_target_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_targeting_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_welfare_household_target
  ON welfare_programs USING GIN (household_target_tags);
CREATE INDEX IF NOT EXISTS idx_welfare_income_target
  ON welfare_programs (income_target_level);
CREATE INDEX IF NOT EXISTS idx_welfare_last_analyzed
  ON welfare_programs (last_targeting_analyzed_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_loan_household_target
  ON loan_programs USING GIN (household_target_tags);
CREATE INDEX IF NOT EXISTS idx_loan_income_target
  ON loan_programs (income_target_level);
CREATE INDEX IF NOT EXISTS idx_loan_last_analyzed
  ON loan_programs (last_targeting_analyzed_at NULLS FIRST);

COMMENT ON COLUMN welfare_programs.income_target_level IS
  'Phase 1.5: 정책이 요구하는 소득 수준 (low=기초생활, mid_low=차상위, mid=중위 100~150%, any=무관). NULL=미분석/불명';
COMMENT ON COLUMN welfare_programs.household_target_tags IS
  'Phase 1.5: 정책이 대상으로 하는 가구 유형 (single_parent, multi_child, married, disabled_family, elderly_family, single)';
COMMENT ON COLUMN welfare_programs.last_targeting_analyzed_at IS
  'Phase 1.5 enrich-targeting cron 마지막 분석 시각. NULL=미분석, updated_at 보다 작으면 재분석 대상';
```

- [ ] **Step 2: Supabase 적용 (Claude 가 사장님 명시 동의 받아 직접)**

Supabase MCP `apply_migration` 으로 적용. project_id=fpnaptuhulcggournikc.

- [ ] **Step 3: 적용 검증**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('welfare_programs','loan_programs')
  AND column_name IN ('income_target_level','household_target_tags','last_targeting_analyzed_at')
ORDER BY table_name, column_name;
```
Expected: 6 rows (3 컬럼 × 2 테이블)

- [ ] **Step 4: lib/database.types.ts 의 WelfareProgram + LoanProgram 에 컬럼 추가**

```ts
// WelfareProgram 타입의 끝에 추가 (1cc2676/f882089 패턴 따라)
  // Phase 1.5: 본문 분석으로 채워지는 자격 컬럼
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
  last_targeting_analyzed_at: string | null;
```
LoanProgram 도 동일.

- [ ] **Step 5: tsc 통과 확인 + 커밋**

```bash
npx tsc --noEmit
git add supabase/migrations/043_program_targeting_columns.sql lib/database.types.ts
git commit -m "feat(personalization): 043 welfare/loan 에 income/household target 컬럼 추가"
```

---

## Task 2: targeting-extract.ts + 단위 테스트 (TDD)

**Files:**
- Create: `lib/personalization/targeting-extract.ts`
- Test: `__tests__/personalization/targeting-extract.test.ts`

- [ ] **Step 1: 실패 테스트 먼저 (TDD)**

```ts
// __tests__/personalization/targeting-extract.test.ts
import { describe, it, expect } from 'vitest';
import { extractTargeting } from '@/lib/personalization/targeting-extract';

describe('extractTargeting — income', () => {
  it('빈 문자열 → null/[]', () => {
    expect(extractTargeting('')).toEqual({
      income_target_level: null,
      household_target_tags: [],
    });
  });

  it('"기초생활" → low', () => {
    expect(extractTargeting('기초생활보장 수급권자 대상').income_target_level).toBe('low');
  });

  it('"수급권자" → low', () => {
    expect(extractTargeting('수급권자 가구 지원').income_target_level).toBe('low');
  });

  it('"긴급복지" → low', () => {
    expect(extractTargeting('긴급복지 대상 의료비').income_target_level).toBe('low');
  });

  it('"차상위" → mid_low', () => {
    expect(extractTargeting('차상위 계층 대상').income_target_level).toBe('mid_low');
  });

  it('"기준중위소득 60%" → mid_low', () => {
    expect(extractTargeting('기준중위소득 60% 이하 가구').income_target_level).toBe('mid_low');
  });

  it('"기준중위소득 80%" → mid_low', () => {
    expect(extractTargeting('기준중위소득 80% 이하').income_target_level).toBe('mid_low');
  });

  it('"기준중위소득 100%" → mid', () => {
    expect(extractTargeting('기준중위소득 100% 이하 신청 가능').income_target_level).toBe('mid');
  });

  it('"기준중위소득 150%" → mid', () => {
    expect(extractTargeting('기준중위소득 150% 이하').income_target_level).toBe('mid');
  });

  it('"전 국민" → any', () => {
    expect(extractTargeting('전 국민 대상 정책').income_target_level).toBe('any');
  });

  it('"소득 무관" → any', () => {
    expect(extractTargeting('소득 무관 신청 가능').income_target_level).toBe('any');
  });

  it('우선순위: low > mid (저소득 키워드가 우선)', () => {
    expect(extractTargeting('기초생활 수급권자, 기준중위소득 100% 이하 모두').income_target_level)
      .toBe('low');
  });

  it('우선순위: mid_low > mid', () => {
    expect(extractTargeting('차상위 또는 기준중위소득 150% 이하').income_target_level).toBe('mid_low');
  });

  it('어느 키워드도 없음 → null', () => {
    expect(extractTargeting('서울시 모든 사업자').income_target_level).toBe(null);
  });
});

describe('extractTargeting — household', () => {
  it('빈 문자열 → []', () => {
    expect(extractTargeting('').household_target_tags).toEqual([]);
  });

  it('"한부모" → [single_parent]', () => {
    expect(extractTargeting('한부모 가정 양육비 지원').household_target_tags).toEqual(['single_parent']);
  });

  it('"다자녀" → [multi_child]', () => {
    expect(extractTargeting('다자녀 가구 우대').household_target_tags).toEqual(['multi_child']);
  });

  it('"3자녀 이상" → [multi_child]', () => {
    expect(extractTargeting('3자녀 이상 가구 대상').household_target_tags).toEqual(['multi_child']);
  });

  it('"신혼부부" → [married]', () => {
    expect(extractTargeting('신혼부부 주거 지원').household_target_tags).toEqual(['married']);
  });

  it('"장애인" → [disabled_family]', () => {
    expect(extractTargeting('장애인 가구 지원').household_target_tags).toEqual(['disabled_family']);
  });

  it('"독거노인" → [elderly_family]', () => {
    expect(extractTargeting('독거노인 돌봄 서비스').household_target_tags).toEqual(['elderly_family']);
  });

  it('"1인가구" → [single]', () => {
    expect(extractTargeting('1인가구 청년 지원').household_target_tags).toEqual(['single']);
  });

  it('여러 가구 유형 동시 매칭', () => {
    const result = extractTargeting('한부모이거나 다자녀 가구 모두 신청 가능');
    expect(result.household_target_tags.sort()).toEqual(['multi_child', 'single_parent']);
  });

  it('어느 키워드도 없음 → []', () => {
    expect(extractTargeting('일반 가구 대상').household_target_tags).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run __tests__/personalization/targeting-extract.test.ts
```
Expected: FAIL — 모듈 not found

- [ ] **Step 3: 구현**

```ts
// lib/personalization/targeting-extract.ts
// Phase 1.5: 정책 본문 키워드 분석으로 income/household target 추출
// LLM 미사용 (Gemini 폐기됨), 정규식 사전만 사용.
// 우선순위 — low > mid_low > mid > any (가장 좁은 범위 우선).

export type IncomeTargetLevel = 'low' | 'mid_low' | 'mid' | 'any';
export type HouseholdTargetTag =
  | 'single_parent'
  | 'multi_child'
  | 'married'
  | 'disabled_family'
  | 'elderly_family'
  | 'single';

const INCOME_KEYWORDS: Record<Exclude<IncomeTargetLevel, 'any'>, RegExp[]> = {
  low: [
    /기초생활/,
    /수급권자/,
    /긴급복지/,
    /의료급여/,
    /생계급여/,
    /주거급여/,
  ],
  mid_low: [
    /차상위/,
    /기준중위소득\s*(60|70|80)\s*%/,
    /중위소득\s*(60|70|80)\s*%/,
  ],
  mid: [
    /기준중위소득\s*(100|120|150)\s*%/,
    /중위소득\s*(100|120|150)\s*%/,
  ],
};

const ANY_INCOME_KEYWORDS: RegExp[] = [
  /전\s*국민/,
  /모든\s*국민/,
  /제한\s*없음/,
  /소득\s*무관/,
];

const HOUSEHOLD_KEYWORDS: Record<HouseholdTargetTag, RegExp[]> = {
  single_parent:    [/한부모/, /한부모가족/, /한부모가정/],
  multi_child:      [/다자녀/, /3자녀\s*이상/, /셋째/, /3명\s*이상\s*자녀/],
  married:          [/신혼부부/, /신혼/],
  disabled_family:  [/장애인/, /장애아동/, /장애아\s*가구/, /중증장애/],
  elderly_family:   [/독거노인/, /고령가구/, /경로/, /노인\s*가구/, /만\s*65세\s*이상/],
  single:           [/1인가구/, /1\s*인가구/, /독거/],
};

export function extractTargeting(haystack: string): {
  income_target_level: IncomeTargetLevel | null;
  household_target_tags: HouseholdTargetTag[];
} {
  // income — 우선순위 순 매칭, 첫 매칭만 사용
  let income: IncomeTargetLevel | null = null;
  for (const level of ['low', 'mid_low', 'mid'] as const) {
    if (INCOME_KEYWORDS[level].some((re) => re.test(haystack))) {
      income = level;
      break;
    }
  }
  if (income === null && ANY_INCOME_KEYWORDS.some((re) => re.test(haystack))) {
    income = 'any';
  }

  // household — 모든 매칭 수집
  const households: HouseholdTargetTag[] = [];
  for (const [tag, patterns] of Object.entries(HOUSEHOLD_KEYWORDS) as [HouseholdTargetTag, RegExp[]][]) {
    if (patterns.some((re) => re.test(haystack))) {
      households.push(tag);
    }
  }

  return {
    income_target_level: income,
    household_target_tags: households,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인 + 커밋**

```bash
npm test -- targeting-extract
git add lib/personalization/targeting-extract.ts __tests__/personalization/targeting-extract.test.ts
git commit -m "feat(personalization): targeting-extract — 본문 키워드로 income/household 추출"
```
Expected: 23 tests PASS

---

## Task 3: enrich-targeting cron route

**Files:**
- Create: `app/api/enrich-targeting/route.ts`

- [ ] **Step 1: 신규 cron route 작성**

```ts
// app/api/enrich-targeting/route.ts
// Phase 1.5: welfare/loan 정책 본문 분석 → income/household target 컬럼 채움
// - cron 호출: 매일 1회 자동, 100건/회
// - backfill 옵션: ?backfill=1&batch=1000 (admin 수동 trigger 용)
// - 처리 대상: last_targeting_analyzed_at IS NULL OR < updated_at

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTargeting } from '@/lib/personalization/targeting-extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: 함수 60초까지

const TABLES = ['welfare_programs', 'loan_programs'] as const;
type TableName = typeof TABLES[number];

async function processTable(
  supabase: ReturnType<typeof createAdminClient>,
  table: TableName,
  batchSize: number,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  const { data: rows, error: selectError } = await supabase
    .from(table)
    .select('id, title, description, eligibility, detailed_content, updated_at')
    .or('last_targeting_analyzed_at.is.null,last_targeting_analyzed_at.lt.updated_at')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (selectError) {
    console.error(`[enrich-targeting] ${table} select error:`, selectError);
    return { processed: 0, errors: 1 };
  }

  for (const row of rows ?? []) {
    const haystack = [row.title, row.description, row.eligibility, row.detailed_content]
      .filter(Boolean)
      .join(' ');
    const { income_target_level, household_target_tags } = extractTargeting(haystack);
    const { error: updateError } = await supabase
      .from(table)
      .update({
        income_target_level,
        household_target_tags,
        last_targeting_analyzed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updateError) {
      console.error(`[enrich-targeting] ${table} update ${row.id}:`, updateError);
      errors++;
    } else {
      processed++;
    }
  }

  return { processed, errors };
}

export async function GET(request: NextRequest) {
  // CRON_SECRET 검증 (cron 또는 admin 만 호출 가능)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const isBackfill = url.searchParams.get('backfill') === '1';
  const batchSize = isBackfill
    ? Math.min(parseInt(url.searchParams.get('batch') ?? '1000', 10), 2000)
    : 100;

  const supabase = createAdminClient();
  const stats: Record<TableName, { processed: number; errors: number }> = {
    welfare_programs: { processed: 0, errors: 0 },
    loan_programs: { processed: 0, errors: 0 },
  };

  for (const table of TABLES) {
    stats[table] = await processTable(supabase, table, batchSize);
  }

  return NextResponse.json({
    ok: true,
    mode: isBackfill ? 'backfill' : 'cron',
    batchSize,
    stats,
  });
}
```

- [ ] **Step 2: 빌드 + 타입 체크**

```bash
npx tsc --noEmit
npm run build
```
Expected: `/api/enrich-targeting` 라우트 정상 등록

- [ ] **Step 3: 커밋**

```bash
git add app/api/enrich-targeting/route.ts
git commit -m "feat(personalization): /api/enrich-targeting cron + backfill 옵션"
```

---

## Task 4: vercel.json cron 등록

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: 기존 vercel.json 읽기**

```bash
cat vercel.json
```

- [ ] **Step 2: cron 배열에 항목 추가**

기존 `crons` 배열 끝에 추가 (다른 cron 일정과 충돌 회피 — 08:00 UTC = 17:00 KST):

```json
{
  "path": "/api/enrich-targeting",
  "schedule": "0 8 * * *"
}
```

전체 vercel.json 형식 (예시 — 기존 cron 들 보존):
```json
{
  "crons": [
    /* 기존 항목들 */
    { "path": "/api/enrich-targeting", "schedule": "0 8 * * *" }
  ]
}
```

- [ ] **Step 3: 커밋**

```bash
git add vercel.json
git commit -m "feat(personalization): enrich-targeting cron 등록 (08:00 UTC = 17:00 KST)"
```

---

## Task 5: types.ts MatchSignal kind 추가 + score.ts 정확 매칭

**Files:**
- Modify: `lib/personalization/types.ts`
- Modify: `lib/personalization/score.ts`
- Test: `__tests__/personalization/score.test.ts` (기존 + 추가)

- [ ] **Step 1: types.ts 의 MatchSignal.kind enum 확장**

기존 MatchSignal:
```ts
export type MatchSignal = {
  kind: 'region' | 'district' | 'benefit_tags' | 'occupation' | 'age'
        | 'income_keyword' | 'household_keyword' | 'urgent_deadline';
  score: number;
  detail?: string;
};
```

수정:
```ts
export type MatchSignal = {
  kind: 'region' | 'district' | 'benefit_tags' | 'occupation' | 'age'
        | 'income_keyword' | 'household_keyword' | 'urgent_deadline'
        | 'income_target' | 'household_target';   // Phase 1.5 추가
  score: number;
  detail?: string;
};
```

- [ ] **Step 2: score.ts 의 ScorableItem 인터페이스 확장**

```ts
export type ScorableItem = {
  id: string;
  title: string;
  description?: string | null;
  region?: string | null;
  district?: string | null;
  benefit_tags?: string[] | null;
  apply_end?: string | null;
  source?: string | null;
  // Phase 1.5: 정확 매칭 데이터 (extractTargeting 결과)
  income_target_level?: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags?: string[] | null;
};
```

- [ ] **Step 3: score.ts 에 matchesIncomeRequirement 헬퍼 추가**

기존 헬퍼 (regionMatches, isUrgentDeadline) 옆에:

```ts
// 사용자 income_level 이 program 의 income_target_level 자격 충족하는지
// (low 사용자는 mid 정책 자격 됨, 그 반대는 아님)
function matchesIncomeRequirement(
  userLevel: UserSignals['incomeLevel'],
  programLevel: 'low' | 'mid_low' | 'mid' | 'any' | null | undefined,
): boolean {
  if (!userLevel || !programLevel) return false;
  if (programLevel === 'any') return true;
  const userOrder: Record<NonNullable<UserSignals['incomeLevel']>, number> = {
    low: 0, mid_low: 1, mid: 2, mid_high: 3, high: 4,
  };
  const programOrder: Record<'low'|'mid_low'|'mid', number> = {
    low: 0, mid_low: 1, mid: 2,
  };
  return userOrder[userLevel] <= programOrder[programLevel];
}
```

- [ ] **Step 4: scoreProgram 함수의 income/household 시그널 부분 교체**

기존 (Phase 1):
```ts
// 5) 소득 키워드 — 저소득 사용자만, 본문에 저소득 키워드 있을 때 +2
if (user.incomeLevel === 'low' || user.incomeLevel === 'mid_low') {
  if (INCOME_KEYWORDS_LOW.some(k => haystack.includes(k))) {
    signals.push({ kind: 'income_keyword', score: 2 });
  }
}

// 6) 가구상태 키워드 — 일치당 +2
for (const ht of user.householdTypes) {
  const keywords = HOUSEHOLD_KEYWORDS[ht] ?? [];
  if (keywords.some(k => haystack.includes(k))) {
    signals.push({ kind: 'household_keyword', score: 2, detail: ht });
  }
}
```

새 (Phase 1.5 — 정확 매칭 우선, fallback Phase 1):
```ts
// 5) 소득 — 정확 매칭 우선 (+4), 없으면 본문 정규식 fallback (+2)
if (program.income_target_level !== undefined && program.income_target_level !== null) {
  if (matchesIncomeRequirement(user.incomeLevel, program.income_target_level)) {
    signals.push({
      kind: 'income_target',
      score: 4,
      detail: program.income_target_level,
    });
  }
} else if (user.incomeLevel === 'low' || user.incomeLevel === 'mid_low') {
  // Phase 1 fallback (정확 매칭 데이터 없을 때만)
  if (INCOME_KEYWORDS_LOW.some(k => haystack.includes(k))) {
    signals.push({ kind: 'income_keyword', score: 2 });
  }
}

// 6) 가구상태 — 정확 매칭 우선 (+3 × 일치 수), 없으면 본문 정규식 fallback (+2 × 일치 수)
if (program.household_target_tags && program.household_target_tags.length > 0) {
  const overlap = user.householdTypes.filter(ht =>
    program.household_target_tags!.includes(ht),
  );
  if (overlap.length > 0) {
    signals.push({
      kind: 'household_target',
      score: 3 * overlap.length,
      detail: overlap.join(', '),
    });
  }
} else {
  // Phase 1 fallback
  for (const ht of user.householdTypes) {
    const keywords = HOUSEHOLD_KEYWORDS[ht] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'household_keyword', score: 2, detail: ht });
    }
  }
}
```

- [ ] **Step 5: score.test.ts 에 정확 매칭 케이스 추가**

기존 테스트 끝에:

```ts
describe('scoreProgram — Phase 1.5 정확 매칭', () => {
  it('income_target_level=low + 사용자 low → +4', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'low' },
      { ...emptyUser, incomeLevel: 'low' },
    );
    expect(r.score).toBe(4);
    expect(r.signals.find(s => s.kind === 'income_target')).toBeDefined();
  });

  it('income_target_level=mid + 사용자 low → +4 (low 가 mid 자격 충족)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'mid' },
      { ...emptyUser, incomeLevel: 'low' },
    );
    expect(r.score).toBe(4);
  });

  it('income_target_level=low + 사용자 high → 0 (자격 미달)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'low' },
      { ...emptyUser, incomeLevel: 'high' },
    );
    expect(r.score).toBe(0);
  });

  it('income_target_level=any → 모든 사용자 +4', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'any' },
      { ...emptyUser, incomeLevel: 'high' },
    );
    expect(r.score).toBe(4);
  });

  it('household_target_tags 1개 일치 → +3', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        household_target_tags: ['single_parent'] },
      { ...emptyUser, householdTypes: ['single_parent'] },
    );
    expect(r.score).toBe(3);
  });

  it('household_target_tags 2개 일치 → +6', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        household_target_tags: ['single_parent', 'multi_child'] },
      { ...emptyUser, householdTypes: ['single_parent', 'multi_child'] },
    );
    expect(r.score).toBe(6);
  });

  it('income_target_level=null + 본문에 "기초생활" → fallback +2 (Phase 1)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '기초생활보장 수급권자 대상',
        income_target_level: null },
      { ...emptyUser, incomeLevel: 'low' },
    );
    expect(r.score).toBe(2);
    expect(r.signals.find(s => s.kind === 'income_keyword')).toBeDefined();
  });

  it('income_target_level 채워져 있고 자격 미달 → fallback 도 안 함', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '기초생활 수급권자 대상',
        income_target_level: 'low' },
      { ...emptyUser, incomeLevel: 'high' },
    );
    expect(r.score).toBe(0);  // fallback 안 함 (정확 매칭이 우선이라 high 는 자격 없음)
  });
});
```

- [ ] **Step 6: 테스트 통과 + 커밋**

```bash
npm test
npx tsc --noEmit
git add lib/personalization/types.ts lib/personalization/score.ts __tests__/personalization/score.test.ts
git commit -m "feat(personalization): score.ts Phase 1.5 정확 매칭 (+4/+3) + Phase 1 fallback"
```
Expected: 기존 13 + 신규 8 = 21 tests PASS (interest 6 + filter 4 + targeting-extract 23 포함 총 54)

---

## Task 6: welfareToScorable / loanToScorable / home-recommend-auto 갱신

**Files:**
- Modify: `app/welfare/page.tsx`
- Modify: `app/loan/page.tsx`
- Modify: `components/home-recommend-auto.tsx`

- [ ] **Step 1: app/welfare/page.tsx 의 welfareToScorable 갱신**

기존:
```ts
function welfareToScorable(w: WelfareProgram): ScorableItem {
  return {
    id: w.id,
    title: w.title,
    description: [w.description, w.eligibility, w.detailed_content]
      .filter(Boolean).join(" "),
    region: w.region ?? null,
    district: null,
    benefit_tags: w.benefit_tags ?? [],
    apply_end: w.apply_end ?? null,
    source: w.source,
  };
}
```

수정:
```ts
function welfareToScorable(w: WelfareProgram): ScorableItem {
  return {
    id: w.id,
    title: w.title,
    description: [w.description, w.eligibility, w.detailed_content]
      .filter(Boolean).join(" "),
    region: w.region ?? null,
    district: null,
    benefit_tags: w.benefit_tags ?? [],
    apply_end: w.apply_end ?? null,
    source: w.source,
    // Phase 1.5 — 정확 매칭 데이터
    income_target_level: w.income_target_level,
    household_target_tags: w.household_target_tags ?? [],
  };
}
```

- [ ] **Step 2: app/loan/page.tsx 의 loanToScorable 동일 갱신**

```ts
return {
  id: l.id,
  title: l.title,
  // ... 기존 필드
  // Phase 1.5
  income_target_level: l.income_target_level,
  household_target_tags: l.household_target_tags ?? [],
};
```

- [ ] **Step 3: components/home-recommend-auto.tsx 의 welfareRowToScorable 갱신**

select 컬럼에 두 필드 추가:
```ts
.select('id, title, description, eligibility, detailed_content, region, apply_end, source, benefit_tags, income_target_level, household_target_tags')
```

함수 인자 타입 + 반환에 두 필드 추가:
```ts
function welfareRowToScorable(row: {
  id: string;
  title: string;
  description: string | null;
  eligibility: string | null;
  detailed_content: string | null;
  region: string | null;
  apply_end: string | null;
  source: string;
  benefit_tags: string[] | null;
  income_target_level: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags: string[] | null;
}): ScorableItem {
  return {
    // ... 기존
    income_target_level: row.income_target_level,
    household_target_tags: row.household_target_tags ?? [],
  };
}
```

- [ ] **Step 4: 빌드 + 커밋**

```bash
npx tsc --noEmit
npm run build
git add app/welfare/page.tsx app/loan/page.tsx components/home-recommend-auto.tsx
git commit -m "feat(personalization): welfare/loan/home 변환 함수에 Phase 1.5 컬럼 매핑"
```

---

## Task 7: /admin/targeting 페이지 (진행률 + 백필 trigger)

**Files:**
- Create: `app/admin/targeting/page.tsx`

- [ ] **Step 1: 신규 admin 페이지 작성**

```tsx
// app/admin/targeting/page.tsx
// Phase 1.5 운영 페이지 — 본문 분석 진행률 + 수동 백필 trigger
// /admin 권한 필요 (기존 admin gate 패턴 따름)

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function getStats(supabase: ReturnType<typeof createAdminClient>) {
  const tables = ['welfare_programs', 'loan_programs'] as const;
  const stats: Record<string, {
    total: number;
    analyzed: number;
    income: { low: number; mid_low: number; mid: number; any: number; null: number };
  }> = {};

  for (const table of tables) {
    const [
      { count: total },
      { count: analyzed },
      { data: incomeDist },
    ] = await Promise.all([
      supabase.from(table).select('*', { count: 'exact', head: true }),
      supabase.from(table).select('*', { count: 'exact', head: true })
        .not('last_targeting_analyzed_at', 'is', null),
      supabase.from(table).select('income_target_level'),
    ]);
    const income = { low: 0, mid_low: 0, mid: 0, any: 0, null: 0 };
    for (const row of incomeDist ?? []) {
      const key = row.income_target_level ?? 'null';
      income[key as keyof typeof income]++;
    }
    stats[table] = { total: total ?? 0, analyzed: analyzed ?? 0, income };
  }
  return stats;
}

export default async function TargetingAdminPage() {
  await requireAdmin();
  const supabase = createAdminClient();
  const stats = await getStats(supabase);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Phase 1.5 본문 분석 운영</h1>

      <section className="space-y-6">
        {Object.entries(stats).map(([table, s]) => {
          const pct = s.total ? Math.round((s.analyzed / s.total) * 100) : 0;
          return (
            <div key={table} className="border rounded-xl p-5 bg-white">
              <h2 className="font-bold mb-3">{table}</h2>
              <p className="text-sm">
                분석 완료: {s.analyzed.toLocaleString()} / {s.total.toLocaleString()}
                <span className="ml-2 text-emerald-700 font-medium">({pct}%)</span>
              </p>
              <div className="mt-3 text-xs text-zinc-600">
                income 분포: low {s.income.low} · mid_low {s.income.mid_low} ·
                mid {s.income.mid} · any {s.income.any} ·
                null(미분석/불명) {s.income.null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-8 border-2 border-emerald-300 rounded-xl p-5 bg-emerald-50/30">
        <h2 className="font-bold mb-3">백필 batch trigger</h2>
        <p className="text-sm mb-4">
          한 번 클릭에 1000건 처리. 12회 정도 클릭하면 전체 백필 완료.
        </p>
        <a
          href="/api/enrich-targeting?backfill=1&batch=1000"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          1000건 백필 실행 →
        </a>
        <p className="text-xs text-zinc-500 mt-3">
          ⚠️ 인증 필요 — Bearer CRON_SECRET 헤더 자동 첨부 안 됨.
          curl 사용: <code className="bg-white px-1 py-0.5 rounded text-[11px]">
            curl -H "Authorization: Bearer $CRON_SECRET" "https://keepioo.com/api/enrich-targeting?backfill=1&batch=1000"
          </code>
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npx tsc --noEmit
npm run build
```
Expected: `/admin/targeting` 라우트 정상 등록

- [ ] **Step 3: 커밋**

```bash
git add app/admin/targeting/page.tsx
git commit -m "feat(personalization): /admin/targeting 진행률 + 백필 trigger 페이지"
```

---

## Task 8: 백필 실행 (사장님 명시 동의 후 Claude 가 직접)

**Files:** 없음 (운영 작업)

⚠️ production DB write — 사장님 명시 동의 받아 Claude 가 진행 (Section A 의 마이그레이션 적용 패턴과 동일)

- [ ] **Step 1: 사장님 동의 받기**

"043 마이그레이션 production 적용 + 백필 12회 (전체 ~12,000행) Claude 가 진행해도 되나요?"

- [ ] **Step 2: 마이그레이션 적용 (Supabase MCP)**

```
mcp__plugin_supabase_supabase__apply_migration
project_id: fpnaptuhulcggournikc
name: 043_program_targeting_columns
query: (Task 1 의 SQL 그대로)
```

- [ ] **Step 3: 컬럼 추가 검증**

Supabase MCP `execute_sql` 로 confirm.

- [ ] **Step 4: types 재생성 (필요 시)**

`mcp__plugin_supabase_supabase__generate_typescript_types` — manual lib/database.types.ts 와 별개라 생략 가능.

- [ ] **Step 5: 백필 12회 batch 실행**

curl 으로 12회 호출 (CRON_SECRET 환경변수 사용):

```bash
for i in {1..12}; do
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "https://keepioo.com/api/enrich-targeting?backfill=1&batch=1000"
  sleep 2
done
```

또는 admin 페이지에서 사장님이 12번 클릭.

- [ ] **Step 6: 진행률 확인**

```sql
SELECT
  'welfare' AS t, count(*) AS total,
  count(*) FILTER (WHERE last_targeting_analyzed_at IS NOT NULL) AS analyzed
FROM welfare_programs
UNION ALL
SELECT
  'loan' AS t, count(*) AS total,
  count(*) FILTER (WHERE last_targeting_analyzed_at IS NOT NULL) AS analyzed
FROM loan_programs;
```

100% 분석 완료 확인.

- [ ] **Step 7: 분포 spot check (사장님 검수)**

```sql
SELECT income_target_level, count(*)
FROM welfare_programs
GROUP BY income_target_level
ORDER BY count(*) DESC;

SELECT unnest(household_target_tags) AS tag, count(*)
FROM welfare_programs
GROUP BY tag
ORDER BY count(*) DESC;
```

분포가 합리적인지 (low/mid_low 가 있는지, 한부모/다자녀 등 분포) 사장님 검수.

---

## 자체 리뷰 체크포인트

- [ ] spec §2 데이터 모델 → Task 1
- [ ] spec §3 키워드 사전 → Task 2 (TDD)
- [ ] spec §4 enrich-targeting cron → Task 3, 4
- [ ] spec §5 score.ts 가중치 전환 → Task 5
- [ ] spec §6 /admin 진행률 + 백필 trigger → Task 7
- [ ] spec §7 테스트 → Task 2 + Task 5 (단위), Task 8 (수동 spot check)
- [ ] spec §4-1 백필 전략 → Task 8
- [ ] Phase 1 회귀 0 — fallback 로직으로 정확 매칭 데이터 없는 행도 기존 동작 유지

---

## 향후 작업 (이 plan 범위 외)

- 키워드 사전 정확도 개선 — false positive/negative 발견 시 정정 + last_targeting_analyzed_at NULL 화로 재분석
- news 콘텐츠로의 확장 (필요 시)
- LLM 기반 추출 (Gemini 폐기됨이라 미정 — Claude API 도입 시 재검토)
