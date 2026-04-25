# 사용자별 맞춤화 Phase 1.5 — 정책 본문 분석으로 income/household 컬럼 자동 채움

- **작성일**: 2026-04-25 야간
- **참조**: Phase 1 spec (`2026-04-25-personalization-design.md` §3-6, §9), Phase 1 plan
- **목표 영역**: welfare_programs + loan_programs (사장님 결정)

---

## 1. 개요와 목표

### 1-1. 문제

Phase 1 의 score.ts 는 본문 정규식 매칭으로만 income/household 시그널을 +2점/+2점 가산한다. 정확한 정책 자격 컬럼 (`income_target_level`, `household_target_tags`) 이 없어:

- "기초생활보장 수준" 사용자가 "고소득" 정책에 매칭되는 false positive 발생 가능
- "한부모 가구" 키워드만 본문에 있어도 한부모 사용자에게 안 보일 수도 (정규식 누락)
- 점수 상한 낮아 분리 섹션 노출 부족 가능

### 1-2. 목표

정책 본문 키워드를 분석해 두 컬럼 자동 채움 → score.ts 정확 매칭 (+4 / +3 × 일치) 으로 전환:

- 매칭 정확도 대폭 향상 (false positive ↓, true positive ↑)
- score 상한 ↑ (분리 섹션 노출 자연 증가)
- /admin 에 분석 진행률 가시화

### 1-3. 비목표 (YAGNI)

- LLM 기반 추출 (Gemini 폐기됨)
- news/blog 분석 (콘텐츠라 의미 작음)
- 다국어 (한국어만)
- 행정구 단위 미세 추출 (광역만)
- 신청 자격 자동 판정 (단순 분류만)

---

## 2. 데이터 모델 (마이그레이션 043)

```sql
-- supabase/migrations/043_program_targeting_columns.sql
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
  'Phase 1.5: 정책이 대상으로 하는 가구 유형 배열 (single_parent, multi_child, married, disabled_family, elderly_family, single)';
COMMENT ON COLUMN welfare_programs.last_targeting_analyzed_at IS
  'Phase 1.5 enrich-targeting cron 마지막 분석 시각. 키워드 사전 변경 시 NULL 화로 재분석 트리거';
```

### 2-1. income_target_level 의미

| 값 | 설명 | 매칭 사용자 |
|---|---|---|
| `low` | 기초생활보장 수준 | low 사용자만 |
| `mid_low` | 차상위·기준중위소득 60~80% | low, mid_low |
| `mid` | 기준중위소득 100~150% | low, mid_low, mid |
| `any` | 소득 무관 | 모든 사용자 |
| `null` | 미분석/불명 | 매칭 안 함 (fallback 으로 본문 정규식) |

### 2-2. household_target_tags 후보값

`single_parent`, `multi_child`, `married`, `disabled_family`, `elderly_family`, `single` (lib/profile-options.ts 의 HOUSEHOLD_OPTIONS 와 동일)

---

## 3. 키워드 사전 (`lib/personalization/targeting-extract.ts`)

```ts
type IncomeLevel = 'low' | 'mid_low' | 'mid' | 'any';
type HouseholdTag = 'single_parent' | 'multi_child' | 'married'
                  | 'disabled_family' | 'elderly_family' | 'single';

// 우선순위: low > mid_low > mid > any (가장 좁은 범위 우선)
const INCOME_KEYWORDS: Record<Exclude<IncomeLevel, 'any'>, RegExp[]> = {
  low:    [/기초생활/, /수급권자/, /긴급복지/, /의료급여/, /생계급여/, /주거급여/],
  mid_low: [/차상위/, /기준중위소득\s*(60|70|80)\s*%/, /중위소득\s*(60|70|80)\s*%/],
  mid:    [/기준중위소득\s*(100|120|150)\s*%/, /중위소득\s*(100|120|150)\s*%/],
};
const ANY_INCOME_KEYWORDS = [/전\s*국민/, /모든\s*국민/, /제한\s*없음/, /소득\s*무관/];

const HOUSEHOLD_KEYWORDS: Record<HouseholdTag, RegExp[]> = {
  single_parent:    [/한부모/, /한부모가족/, /한부모가정/],
  multi_child:      [/다자녀/, /3자녀\s*이상/, /셋째/, /3명\s*이상\s*자녀/],
  married:          [/신혼부부/, /신혼/],
  disabled_family:  [/장애인/, /장애아동/, /장애아\s*가구/, /중증장애/],
  elderly_family:   [/독거노인/, /고령가구/, /경로/, /노인\s*가구/, /만\s*65세\s*이상/],
  single:           [/1인가구/, /1\s*인가구/, /독거/],
};

export function extractTargeting(haystack: string): {
  income_target_level: IncomeLevel | null;
  household_target_tags: HouseholdTag[];
} {
  // 우선순위 순 매칭 — 첫 번째 매칭 결과 사용
  let income: IncomeLevel | null = null;
  for (const level of ['low', 'mid_low', 'mid'] as const) {
    if (INCOME_KEYWORDS[level].some(re => re.test(haystack))) {
      income = level;
      break;
    }
  }
  if (income === null && ANY_INCOME_KEYWORDS.some(re => re.test(haystack))) {
    income = 'any';
  }

  const households: HouseholdTag[] = [];
  for (const [tag, patterns] of Object.entries(HOUSEHOLD_KEYWORDS)) {
    if (patterns.some(re => re.test(haystack))) {
      households.push(tag as HouseholdTag);
    }
  }

  return {
    income_target_level: income,
    household_target_tags: households,
  };
}
```

haystack = `${title} ${description ?? ''} ${eligibility ?? ''} ${detailed_content ?? ''}`

---

## 4. enrich-targeting cron (`app/api/enrich-targeting/route.ts`)

```ts
// 매일 1회 실행 (Vercel Pro cron)
// 처리 순서:
// 1. last_targeting_analyzed_at IS NULL 또는 < updated_at 인 행 100건 select
// 2. extractTargeting() 통과
// 3. UPDATE row SET income_target_level=..., household_target_tags=..., last_targeting_analyzed_at=NOW()
// 4. welfare 끝나면 loan 처리

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // CRON_SECRET 검증 (기존 cron 패턴과 동일)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = await createAdminClient();
  const stats = { welfare: { processed: 0, errors: 0 }, loan: { processed: 0, errors: 0 } };

  for (const tableName of ['welfare_programs', 'loan_programs'] as const) {
    const { data: rows } = await supabase
      .from(tableName)
      .select('id, title, description, eligibility, detailed_content, updated_at')
      .or('last_targeting_analyzed_at.is.null,last_targeting_analyzed_at.lt.updated_at')
      .limit(100);

    for (const row of rows ?? []) {
      const haystack = [row.title, row.description, row.eligibility, row.detailed_content]
        .filter(Boolean).join(' ');
      const { income_target_level, household_target_tags } = extractTargeting(haystack);
      const { error } = await supabase
        .from(tableName)
        .update({
          income_target_level,
          household_target_tags,
          last_targeting_analyzed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) stats[tableName.split('_')[0]].errors++;
      else stats[tableName.split('_')[0]].processed++;
    }
  }

  return Response.json({ ok: true, stats });
}
```

vercel.json 에 cron 추가:
```json
{ "path": "/api/enrich-targeting", "schedule": "0 8 * * *" }
```

### 4-1. 백필 전략

**문제**: 12,000+ 행 / 100건/회 = 120일 소요 → 너무 늦음

**해결**: 배포 직후 1회 수동 백필 SQL (Supabase Dashboard 또는 admin trigger)

```sql
-- 백필 1회: 모든 row 의 last_targeting_analyzed_at 을 NULL 로 → cron 이 분석
-- 단 cron 이 100건씩 처리하니 12,000행은 여전히 늦음.
-- → admin 페이지에서 batch 수동 trigger (1000건씩 5분 간격) 또는
-- → 별도 백필 스크립트 (TypeScript) 1회 실행
```

권장: `/api/enrich-targeting?backfill=1&batch=1000` 옵션 추가 → admin 페이지에서 수동 클릭으로 1000건씩 처리. 12회 클릭으로 12,000행 완료 (또는 setTimeout 자동 chained).

---

## 5. score.ts 가중치 전환

기존 `lib/personalization/score.ts` 의 income_keyword/household_keyword 시그널을 수정:

```ts
// 추가: 정확 매칭 함수
function matchesIncomeRequirement(
  userLevel: UserSignals['incomeLevel'],
  programLevel: 'low' | 'mid_low' | 'mid' | 'any' | null,
): boolean {
  if (!userLevel || !programLevel) return false;
  if (programLevel === 'any') return true;
  // 사용자 income 이 program target 보다 같거나 낮으면 자격
  // (low 사용자는 mid 정책 자격 됨, 그 반대는 아님)
  const order = { low: 0, mid_low: 1, mid: 2, mid_high: 3, high: 4 };
  const programOrder = { low: 0, mid_low: 1, mid: 2 };
  return order[userLevel] <= programOrder[programLevel];
}

// 정확 매칭 우선, 없으면 본문 정규식 fallback
const programIncomeTarget = (program as any).income_target_level as
  'low'|'mid_low'|'mid'|'any'|null|undefined;
if (programIncomeTarget) {
  if (matchesIncomeRequirement(user.incomeLevel, programIncomeTarget)) {
    signals.push({ kind: 'income_target', score: 4, detail: programIncomeTarget });
  }
} else if (user.incomeLevel === 'low' || user.incomeLevel === 'mid_low') {
  // Phase 1 fallback (정확 매칭 데이터 없을 때만)
  if (INCOME_KEYWORDS_LOW.some(k => haystack.includes(k))) {
    signals.push({ kind: 'income_keyword', score: 2 });
  }
}

// household 도 동일 패턴
const programHouseholdTarget = (program as any).household_target_tags as string[] | null | undefined;
if (programHouseholdTarget && programHouseholdTarget.length > 0) {
  // 정확 매칭: 사용자 household_types 와 program target 의 교집합
  const overlap = user.householdTypes.filter(ht => programHouseholdTarget.includes(ht));
  if (overlap.length > 0) {
    signals.push({
      kind: 'household_target',
      score: 3 * overlap.length,
      detail: overlap.join(', '),
    });
  }
} else {
  // Phase 1 fallback (본문 정규식)
  for (const ht of user.householdTypes) {
    const keywords = HOUSEHOLD_KEYWORDS[ht] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'household_keyword', score: 2, detail: ht });
    }
  }
}
```

### 5-1. ScorableItem 인터페이스 확장

`lib/personalization/score.ts` 의 ScorableItem 에 두 필드 추가:

```ts
export type ScorableItem = {
  // ... 기존
  income_target_level?: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags?: string[] | null;
};
```

`MatchSignal.kind` 에 `'income_target'`, `'household_target'` 추가.

### 5-2. welfareToScorable / loanToScorable 갱신

각 변환 함수에 두 필드 매핑 추가:

```ts
return {
  // ... 기존
  income_target_level: w.income_target_level ?? null,
  household_target_tags: w.household_target_tags ?? [],
};
```

---

## 6. /admin 통합

### 6-1. 분석 진행률 지표

`/admin` 대시보드 (또는 신규 `/admin/targeting`) 에 다음 표시:

- welfare 분석 완료: X / Y (Z%)
- loan 분석 완료: X / Y (Z%)
- 마지막 cron 실행 시각
- income_target_level 분포 (low / mid_low / mid / any / null)

SQL 으로 단순 집계.

### 6-2. 수동 trigger 버튼

`/admin` 에 "Phase 1.5 백필 1000건 처리" 버튼 — `/api/enrich-targeting?backfill=1&batch=1000` 호출. 12회 클릭으로 백필 완료.

---

## 7. 테스트

### 7-1. 단위 (`__tests__/personalization/targeting-extract.test.ts`)

- 각 income level 의 키워드 케이스별 매칭
- 우선순위: "기초생활" + "기준중위소득 100%" 동시 → low (가장 좁은 범위)
- 빈 문자열 → null/[]
- ANY_INCOME_KEYWORDS → 'any'
- 모든 household 키워드별 매칭

### 7-2. 통합 (수동 spot check)

- 백필 후 50건 표본 추출해 사장님 검수
- false positive/negative 발견 시 키워드 사전 정정 → 재분석

---

## 8. 영향 범위

### 8-1. UI 변화 없음
- score.ts 가중치만 변경 → 분리 섹션 결과 약간 변동 (정확도 향상)
- 사용자가 보이는 화면 구조는 동일

### 8-2. DB 영향
- 컬럼 3개 추가 × 2 테이블 = 6 컬럼 (NULL 허용)
- 인덱스 6개 추가 (GIN + BTREE)

### 8-3. cron 추가
- vercel.json 에 1개 cron (08:00 UTC 매일)
- enrich-detail cron 과 별도 운영

### 8-4. 비용
- Vercel Pro cron 한도 내 (월 100,000 invocations)
- DB write: 12,000 행 백필 + 매일 신규 ~50건 = 무시 수준

---

## 9. 마이그레이션 번호 예약

| 번호 | 내용 |
|---|---|
| `043_program_targeting_columns.sql` | welfare/loan 에 income_target_level, household_target_tags, last_targeting_analyzed_at 컬럼 + GIN/BTREE 인덱스 |

---

## 10. 결정 로그 (사장님 답변)

| 결정 | 답변 |
|---|---|
| 적용 범위 | welfare + loan 둘 다 (news/blog 제외) |
| 실행 방식 | 신규 enrich cron + 1회 백필 (collector 변경 0) |
