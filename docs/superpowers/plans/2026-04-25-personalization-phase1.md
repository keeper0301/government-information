# 사용자별 맞춤형 정보 제공 — Phase 1 (welfare 슬라이스) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keepioo.com 의 4가지 맞춤화 부재(피드 동일·홈 추천 부재·온보딩 부재·interests 무용지물)를 welfare 페이지를 첫 슬라이스로 동시 해소한다.

**Architecture:** 공통 추천 인프라(`lib/personalization/*`)를 처음부터 영역 독립적으로 설계 → welfare 페이지에 분리 섹션(맞춤 5–10건 + 전체 마감일순) 통합 → 단계형 5단계 온보딩 + 자동 알림 규칙 1건 생성으로 입력→노출 사이클 닫음. loan/news/blog 는 후속 plan 에서 같은 공통 모듈을 재사용.

**Tech Stack:** Next.js App Router (RSC), Supabase Postgres + RLS, TypeScript, Vitest (단위 테스트), Tailwind CSS.

**참조 spec:** `docs/superpowers/specs/2026-04-25-personalization-design.md` (commit 86e40dc)

---

## 목차

- **Section A — 데이터 인프라** (Task 1–10): DB 마이그레이션 + 추천 엔진. 끝나면 deploy 가능 (UI 변화 없음, 회귀 0)
- **Section B — 입력 흐름** (Task 11–17): profile-options 확장 + 마이페이지 폼 확장 + 온보딩 5단계 + 자동 알림 규칙. 끝나면 신규 사용자가 프로필 입력 가능
- **Section C — 노출 통합** (Task 18–24): 공통 컴포넌트 3개 + welfare 페이지 통합 + 홈 카드 분기 + 처리방침 + 통합 QA. 끝나면 사용자가 맞춤 결과 체감

각 Section 끝에 deploy checkpoint. master 직접 푸시(keepioo 워크플로) → Vercel 자동 배포 → 사장님 검수 → 다음 Section 진입.

---

## Task 0: 사전 — vitest 설치 (Section A 시작 전 1회)

**Files:**
- Modify: `package.json`, `package-lock.json`

> 현재 프로젝트에 vitest 가 없어 Task 6/7/8 의 단위 테스트가 실행되지 않는다. 사장님 룰("물어보지 않고 패키지 설치 금지")에 따라 **사장님 명시 동의 후** 1회 설치.
>
> 동의 안 시 대안: TDD 단계는 건너뛰고 plan 의 테스트 코드는 참고용으로만 두고, 수동 검증으로 대체 (회귀 위험 ↑).

- [ ] **Step 1: 사장님 동의 확인**

설치 패키지: `vitest`, `@vitejs/plugin-react`, `jsdom` (총 3개, devDependency)
용도: lib/personalization/* 단위 테스트만. 별도 CI 추가 없음, 로컬에서 `npx vitest run` 으로 실행.

- [ ] **Step 2: 동의 시 설치**

```bash
npm install --save-dev vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: vitest.config.ts 생성**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: package.json scripts 에 test 추가**

```json
"scripts": {
  // ...기존
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: 더미 테스트로 동작 확인**

```bash
mkdir -p __tests__
cat > __tests__/sanity.test.ts <<'EOF'
import { describe, it, expect } from 'vitest';
describe('vitest', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
EOF
npm test
```

Expected: PASS (1 test)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json vitest.config.ts __tests__/sanity.test.ts
git commit -m "chore(test): vitest 도입 (lib/personalization 단위 테스트용)"
```

---

## File Structure

### 새로 만드는 파일

```
supabase/migrations/
  ├── 038_user_profile_extended.sql
  ├── 039_interest_to_benefit_trigger.sql
  ├── 040_alert_rule_auto_flag.sql
  └── 041_profile_dismiss_tracking.sql

lib/personalization/
  ├── types.ts                  # UserSignals, ScoredItem, MatchSignal
  ├── interest-mapping.ts       # interests 9종 → BENEFIT_TAGS 14종 변환
  ├── score.ts                  # 정책 1건의 사용자 적합도 점수 계산
  ├── filter.ts                 # 점수 ≥ threshold 항목 추리고 정렬
  ├── load-profile.ts           # React cache 로 1회만 DB 조회
  └── auto-rule.ts              # 자동 알림 규칙 생성·갱신

__tests__/personalization/
  ├── interest-mapping.test.ts
  ├── score.test.ts
  └── filter.test.ts

app/onboarding/
  ├── page.tsx                  # /onboarding 라우트 진입점 (RSC)
  ├── onboarding-flow.tsx       # client component, step state
  └── steps/
      ├── step-age.tsx
      ├── step-region.tsx
      ├── step-occupation.tsx
      ├── step-income.tsx
      └── step-interests.tsx

components/personalization/
  ├── PersonalizedSection.tsx   # "🌟 ○○님께 맞는 정책" 섹션
  ├── EmptyProfilePrompt.tsx    # 프로필 빈 사용자에게 온보딩 유도
  └── MatchBadge.tsx            # 전체 리스트의 매칭 항목에 ✨ 배지
```

### 수정하는 파일

```
lib/profile-options.ts                # INCOME_OPTIONS, HOUSEHOLD_OPTIONS 추가
app/mypage/profile-form.tsx           # income_level, household_types 필드
app/auth/callback/route.ts (또는 동급)  # 첫 로그인 시 /onboarding redirect
app/welfare/page.tsx                  # PersonalizedSection 통합
components/home-recommend-card.tsx    # 로그인+프로필 분기, 자동 결과 카드
app/page.tsx                          # HomeRecommendCard 호출 부분
app/privacy/page.tsx                  # 신규 수집 항목(소득/가구) 명시
```

---

# Section A — 데이터 인프라

## Task 1: 마이그레이션 038 — user_profiles 컬럼 확장

**Files:**
- Create: `supabase/migrations/038_user_profile_extended.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/038_user_profile_extended.sql
-- 맞춤형 추천을 위한 user_profiles 컬럼 확장
-- - income_level: 기준중위소득 비율 구간 (수치 입력 회피)
-- - household_types: 다중 선택 (한부모이자 다자녀 가능)
-- - benefit_tags: interests 9종을 BENEFIT_TAGS 14종으로 변환·캐시 (조회 속도)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS income_level TEXT
    CHECK (income_level IN ('low', 'mid_low', 'mid', 'mid_high', 'high') OR income_level IS NULL),
  ADD COLUMN IF NOT EXISTS household_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benefit_tags TEXT[] DEFAULT '{}';

-- GIN 인덱스: 배열 overlap 매칭 빠르게
CREATE INDEX IF NOT EXISTS idx_user_profiles_benefit_tags
  ON user_profiles USING GIN (benefit_tags);

CREATE INDEX IF NOT EXISTS idx_user_profiles_household_types
  ON user_profiles USING GIN (household_types);

COMMENT ON COLUMN user_profiles.income_level IS
  '소득 구간 (low=기초생활, mid_low=차상위, mid=중위, mid_high=중위 이상, high=고소득)';
COMMENT ON COLUMN user_profiles.household_types IS
  '가구 상태 다중 (single, married, single_parent, multi_child, disabled_family, elderly_family)';
COMMENT ON COLUMN user_profiles.benefit_tags IS
  'interests 를 BENEFIT_TAGS 14종으로 변환한 캐시. 039 트리거가 자동 채움';
```

- [ ] **Step 2: Supabase 에 적용**

Run: `npx supabase db push` (또는 Supabase Dashboard SQL Editor 에서 직접 실행)
Expected: `Applied migration 038_user_profile_extended.sql`

- [ ] **Step 3: 적용 확인**

Run: Supabase Dashboard → Table Editor → user_profiles → 새 컬럼 3개 표시 확인
Or: `psql ... -c "\d user_profiles"`

- [ ] **Step 4: database.types.ts 재생성**

Run: `npx supabase gen types typescript --local > lib/database.types.ts`
Or: 사장님이 보유한 환경 변수로 remote 에서 생성

Expected: `user_profiles` 인터페이스에 `income_level`, `household_types`, `benefit_tags` 추가됨

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/038_user_profile_extended.sql lib/database.types.ts
git commit -m "feat(personalization): 038 user_profiles 에 income_level/household_types/benefit_tags 추가"
```

---

## Task 2: 마이그레이션 039 — interests → benefit_tags 자동 변환 트리거

**Files:**
- Create: `supabase/migrations/039_interest_to_benefit_trigger.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/039_interest_to_benefit_trigger.sql
-- user_profiles.interests 가 변경될 때 benefit_tags 자동 재계산
-- - interests 9종 → BENEFIT_TAGS 14종 매핑 (lib/personalization/interest-mapping.ts 와 동일)
-- - INSERT 와 UPDATE 모두 trigger
-- - lib 레벨 매핑이 truth, DB 트리거는 캐시 동기화 보장용

CREATE OR REPLACE FUNCTION normalize_interests_to_benefit_tags()
RETURNS TRIGGER AS $$
DECLARE
  result_tags TEXT[] := '{}';
  it TEXT;
BEGIN
  IF NEW.interests IS NULL OR array_length(NEW.interests, 1) IS NULL THEN
    NEW.benefit_tags := '{}';
    RETURN NEW;
  END IF;

  FOREACH it IN ARRAY NEW.interests LOOP
    CASE it
      WHEN '주거'      THEN result_tags := result_tags || ARRAY['주거'];
      WHEN '의료/건강' THEN result_tags := result_tags || ARRAY['의료'];
      WHEN '취업/창업' THEN result_tags := result_tags || ARRAY['취업', '창업'];
      WHEN '양육/보육' THEN result_tags := result_tags || ARRAY['양육'];
      WHEN '교육'      THEN result_tags := result_tags || ARRAY['교육'];
      WHEN '복지/생계' THEN result_tags := result_tags || ARRAY['생계', '금융'];
      WHEN '문화/여가' THEN result_tags := result_tags || ARRAY['문화'];
      WHEN '교통'      THEN result_tags := result_tags || ARRAY['교통'];
      WHEN '법률/상담' THEN result_tags := result_tags || ARRAY['법률'];
      ELSE -- 알 수 없는 값은 무시
    END CASE;
  END LOOP;

  -- 중복 제거
  NEW.benefit_tags := (SELECT ARRAY(SELECT DISTINCT unnest(result_tags)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_interests ON user_profiles;
CREATE TRIGGER trg_normalize_interests
  BEFORE INSERT OR UPDATE OF interests ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION normalize_interests_to_benefit_tags();

-- 기존 row 일괄 변환 (UPDATE 트리거가 다시 실행됨)
UPDATE user_profiles SET interests = interests WHERE interests IS NOT NULL;
```

- [ ] **Step 2: 적용 + 검증**

Supabase 에 push 후 Dashboard SQL Editor 에서 검증:

```sql
-- 매핑 검증
SELECT interests, benefit_tags FROM user_profiles WHERE interests IS NOT NULL LIMIT 5;
-- 예: interests=['주거','의료/건강'] → benefit_tags=['주거','의료']
```

Expected: interests 가 있는 모든 row 의 benefit_tags 가 정확히 채워져 있음

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/039_interest_to_benefit_trigger.sql
git commit -m "feat(personalization): 039 interests→benefit_tags 자동 변환 트리거"
```

---

## Task 3: 마이그레이션 040 — user_alert_rules 자동 규칙 추적 컬럼

**Files:**
- Create: `supabase/migrations/040_alert_rule_auto_flag.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/040_alert_rule_auto_flag.sql
-- 자동 생성된 알림 규칙과 사용자 수동 규칙 구분
-- - is_auto_generated: 자동 규칙은 프로필 갱신 시 갱신, 수동 규칙은 보존
-- - auto_rule_disabled_at: 사용자가 자동 규칙을 끄면 다시 자동 생성하지 않음

ALTER TABLE user_alert_rules
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_rule_disabled_at TIMESTAMPTZ;

-- 한 사용자당 자동 규칙은 최대 1개 (활성 + auto_rule_disabled_at IS NULL 조건은 SQL 제약 어렵
-- 으니 부분 unique 인덱스로 보장)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_auto_rule
  ON user_alert_rules (user_id)
  WHERE is_auto_generated = TRUE;

COMMENT ON COLUMN user_alert_rules.is_auto_generated IS
  '온보딩/프로필 저장 시 자동 생성된 규칙 (사용자 수동 규칙과 구분)';
COMMENT ON COLUMN user_alert_rules.auto_rule_disabled_at IS
  '사용자가 자동 규칙을 직접 끈 시각. NULL 이면 자동 갱신 대상';
```

- [ ] **Step 2: 적용 + 검증**

Run: `npx supabase db push`
Expected: 컬럼 2개 추가, unique 인덱스 생성

- [ ] **Step 3: database.types.ts 재생성 + 커밋**

```bash
npx supabase gen types typescript --local > lib/database.types.ts
git add supabase/migrations/040_alert_rule_auto_flag.sql lib/database.types.ts
git commit -m "feat(personalization): 040 user_alert_rules 자동 규칙 플래그"
```

---

## Task 4: 마이그레이션 041 — 온보딩 dismiss 추적

**Files:**
- Create: `supabase/migrations/041_profile_dismiss_tracking.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/041_profile_dismiss_tracking.sql
-- 사용자가 온보딩을 완료/스킵한 시각 기록
-- - 첫 로그인 시 자동 redirect 여부 판단에 사용 (NULL 이면 redirect)
-- - "완료" 와 "건너뛰기" 모두 이 timestamp 채움 (재팝업 방지)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS dismissed_onboarding_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.dismissed_onboarding_at IS
  '온보딩 완료/스킵 시각. NULL 이면 첫 로그인 시 /onboarding 으로 redirect';
```

- [ ] **Step 2: 적용 + 타입 재생성 + 커밋**

```bash
npx supabase db push
npx supabase gen types typescript --local > lib/database.types.ts
git add supabase/migrations/041_profile_dismiss_tracking.sql lib/database.types.ts
git commit -m "feat(personalization): 041 온보딩 dismiss 추적"
```

---

## Task 5: lib/personalization/types.ts — 타입 정의

**Files:**
- Create: `lib/personalization/types.ts`

- [ ] **Step 1: 파일 작성**

```ts
// lib/personalization/types.ts
// 추천 엔진 공용 타입. 영역(welfare/loan/news/blog) 독립적으로 설계.

import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from '@/lib/profile-options';
import type { BenefitTag } from '@/lib/tags/taxonomy';

// 사용자에게서 추출한 매칭 신호 묶음 (DB 의 user_profiles 행에서 변환)
export type UserSignals = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  district: string | null;        // 시군구 (광역에 종속)
  occupation: OccupationOption | null;
  incomeLevel: 'low' | 'mid_low' | 'mid' | 'mid_high' | 'high' | null;
  householdTypes: string[];        // ['single_parent', 'multi_child', ...]
  benefitTags: BenefitTag[];       // 트리거가 변환·저장한 캐시
};

// 매칭 결과: 어떤 신호가 몇 점 기여했는지 추적 (디버깅/노출용)
export type MatchSignal = {
  kind: 'region' | 'district' | 'benefit_tags' | 'occupation' | 'age'
        | 'income_keyword' | 'household_keyword' | 'urgent_deadline';
  score: number;
  detail?: string;  // ex: "기준중위소득 키워드 일치"
};

// 매칭된 정책 1건의 점수 + 시그널 내역
export type ScoredItem<T> = {
  item: T;
  score: number;
  signals: MatchSignal[];
};

// 점수 임계값 — 분리 섹션 노출 기준
export const PERSONAL_SECTION_MIN_SCORE = 5;
export const PERSONAL_SECTION_MAX_ITEMS = 10;
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit lib/personalization/types.ts`
Expected: 에러 없음 (BenefitTag, AgeOption 등 import 정상)

- [ ] **Step 3: 커밋**

```bash
git add lib/personalization/types.ts
git commit -m "feat(personalization): types.ts — UserSignals/ScoredItem/MatchSignal"
```

---

## Task 6: lib/personalization/interest-mapping.ts + 테스트

**Files:**
- Create: `lib/personalization/interest-mapping.ts`
- Test: `__tests__/personalization/interest-mapping.test.ts`

- [ ] **Step 1: 실패하는 테스트 먼저 작성 (TDD)**

```ts
// __tests__/personalization/interest-mapping.test.ts
import { describe, it, expect } from 'vitest';
import {
  INTEREST_TO_BENEFIT_TAGS,
  interestsToBenefitTags,
} from '@/lib/personalization/interest-mapping';

describe('interestsToBenefitTags', () => {
  it('빈 배열·null 입력 → 빈 배열', () => {
    expect(interestsToBenefitTags([])).toEqual([]);
    expect(interestsToBenefitTags(null)).toEqual([]);
  });

  it('단일 interest → 매핑된 tag(s)', () => {
    expect(interestsToBenefitTags(['주거'])).toEqual(['주거']);
    expect(interestsToBenefitTags(['취업/창업']).sort()).toEqual(['창업', '취업']);
    expect(interestsToBenefitTags(['복지/생계']).sort()).toEqual(['금융', '생계']);
  });

  it('여러 interest → 중복 제거 후 합집합', () => {
    const result = interestsToBenefitTags(['주거', '의료/건강', '주거']);
    expect(result.sort()).toEqual(['의료', '주거']);
  });

  it('알 수 없는 interest → 무시', () => {
    expect(interestsToBenefitTags(['알수없음', '주거'])).toEqual(['주거']);
  });

  it('9개 interests 모두 BENEFIT_TAGS 14종에서 가져옴', () => {
    const validBenefits = ['주거','의료','양육','교육','문화','취업','창업',
                           '금융','생계','에너지','교통','장례','법률','기타'];
    for (const tags of Object.values(INTEREST_TO_BENEFIT_TAGS)) {
      for (const tag of tags) {
        expect(validBenefits).toContain(tag);
      }
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/personalization/interest-mapping.test.ts`
Expected: FAIL — 모듈 not found

- [ ] **Step 3: 구현**

```ts
// lib/personalization/interest-mapping.ts
// /mypage/profile-form 의 interests 9종 칩 → BENEFIT_TAGS 14종 매핑
// DB 트리거(039) 와 반드시 동기화 — 둘 중 하나만 바뀌면 회귀
import type { BenefitTag } from '@/lib/tags/taxonomy';

export const INTEREST_TO_BENEFIT_TAGS: Record<string, BenefitTag[]> = {
  '주거':       ['주거'],
  '의료/건강':  ['의료'],
  '취업/창업':  ['취업', '창업'],
  '양육/보육':  ['양육'],
  '교육':       ['교육'],
  '복지/생계':  ['생계', '금융'],
  '문화/여가':  ['문화'],
  '교통':       ['교통'],
  '법률/상담':  ['법률'],
};

export function interestsToBenefitTags(interests: string[] | null): BenefitTag[] {
  if (!interests?.length) return [];
  const set = new Set<BenefitTag>();
  for (const it of interests) {
    for (const tag of INTEREST_TO_BENEFIT_TAGS[it] ?? []) {
      set.add(tag);
    }
  }
  return Array.from(set);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

```bash
npx vitest run __tests__/personalization/interest-mapping.test.ts
# Expected: PASS

git add lib/personalization/interest-mapping.ts __tests__/personalization/interest-mapping.test.ts
git commit -m "feat(personalization): interest-mapping (interests 9종→BENEFIT_TAGS 14종)"
```

---

## Task 7: lib/personalization/score.ts + 테스트

**Files:**
- Create: `lib/personalization/score.ts`
- Test: `__tests__/personalization/score.test.ts`

> spec §4-2 의 점수 계산 규칙(Phase 1 기준) 을 그대로 구현. 정책 테이블에 income_max/household_target 컬럼이 없으므로 본문 정규식 매칭으로 약한 가산점.

- [ ] **Step 1: 실패 테스트**

```ts
// __tests__/personalization/score.test.ts
import { describe, it, expect } from 'vitest';
import { scoreProgram } from '@/lib/personalization/score';
import type { UserSignals } from '@/lib/personalization/types';

const baseUser: UserSignals = {
  ageGroup: '30대',
  region: '서울',
  district: '강남구',
  occupation: '직장인',
  incomeLevel: 'mid_low',
  householdTypes: ['single_parent'],
  benefitTags: ['주거', '교육'],
};

const emptyUser: UserSignals = {
  ageGroup: null, region: null, district: null, occupation: null,
  incomeLevel: null, householdTypes: [], benefitTags: [],
};

const baseProgram = {
  id: 'p1',
  title: '청년 주거 지원',
  description: '서울 강남구 청년 대상 주거비 지원',
  region: '서울특별시',
  district: '강남구',
  benefit_tags: ['주거'] as string[],
  apply_end: null as string | null,
  source: null as string | null,
};

describe('scoreProgram', () => {
  it('빈 프로필 → 점수 0', () => {
    const r = scoreProgram(baseProgram, emptyUser);
    expect(r.score).toBe(0);
    expect(r.signals).toEqual([]);
  });

  it('지역 광역만 매칭 → +5', () => {
    const r = scoreProgram(baseProgram, { ...emptyUser, region: '서울' });
    expect(r.score).toBe(5);
    expect(r.signals.find(s => s.kind === 'region')?.score).toBe(5);
  });

  it('지역 광역 + 시군구 모두 매칭 → +10', () => {
    const r = scoreProgram(baseProgram, { ...emptyUser, region: '서울', district: '강남구' });
    expect(r.score).toBe(10);
  });

  it('benefit_tags 1개 일치 → +3', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null },
      { ...emptyUser, benefitTags: ['주거'] }
    );
    expect(r.score).toBe(3);
  });

  it('benefit_tags 2개 일치 → +6', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: ['주거', '교육'] },
      { ...emptyUser, benefitTags: ['주거', '교육', '양육'] }
    );
    expect(r.score).toBe(6);
  });

  it('직업 키워드 매칭 → +2', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '회사원 대상 지원' },
      { ...emptyUser, occupation: '직장인' }
    );
    expect(r.score).toBe(2);
  });

  it('나이 키워드 매칭 → +1', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '청년 대상' },
      { ...emptyUser, ageGroup: '30대' }
    );
    expect(r.score).toBe(1);
  });

  it('소득 low + 본문에 "기준중위소득" → +2', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '기준중위소득 60% 이하 지원' },
      { ...emptyUser, incomeLevel: 'low' }
    );
    expect(r.score).toBe(2);
  });

  it('소득 high + 본문에 "기준중위소득" → 가산 없음 (저소득 신호만 적용)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '기준중위소득 60% 이하 지원' },
      { ...emptyUser, incomeLevel: 'high' }
    );
    expect(r.score).toBe(0);
  });

  it('가구 한부모 + 본문에 "한부모" → +2', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        description: '한부모 가정 양육비 지원' },
      { ...emptyUser, householdTypes: ['single_parent'] }
    );
    expect(r.score).toBe(2);
  });

  it('마감 D-7 이내 + 다른 매칭 있을 때만 tiebreaker +1', () => {
    const tomorrow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const r = scoreProgram(
      { ...baseProgram, apply_end: tomorrow },
      { ...emptyUser, region: '서울' }
    );
    // 지역 +5 + 마감임박 +1 = 6
    expect(r.score).toBe(6);
  });

  it('마감 D-7 + 다른 매칭 없으면 가산 없음 (스팸 방지)', () => {
    const tomorrow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [], apply_end: tomorrow },
      emptyUser
    );
    expect(r.score).toBe(0);
  });

  it('전국 정책 → 모든 지역 사용자에게 매칭', () => {
    const r = scoreProgram(
      { ...baseProgram, region: '전국', district: null, benefit_tags: [] },
      { ...emptyUser, region: '경남' }
    );
    expect(r.score).toBe(5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/personalization/score.test.ts`
Expected: FAIL — 모듈 not found

- [ ] **Step 3: 구현**

```ts
// lib/personalization/score.ts
// 정책 1건이 사용자 프로필에 얼마나 맞는지 점수 계산
// spec §4-2 (Phase 1) 기준. 소득·가구상태는 본문 정규식 매칭으로 약한 가산점.

import { AGE_KEYWORDS, OCCUPATION_KEYWORDS } from '@/lib/profile-options';
import type { UserSignals, MatchSignal, ScoredItem } from './types';

// 점수 계산이 필요한 정책의 최소 형태 (welfare/loan/news 공통)
export type ScorableItem = {
  id: string;
  title: string;
  description?: string | null;
  region?: string | null;
  district?: string | null;
  benefit_tags?: string[] | null;
  apply_end?: string | null;
  source?: string | null;
};

// 지역 별칭 — 기존 lib/recommend.ts 와 동일 (DRY 위해 통일하면 좋지만
// 현 단계에서는 lib/recommend.ts 도 변경 위험 → 복제 허용, 추후 공통화)
const REGION_ALIASES: Record<string, string[]> = {
  '서울': ['서울특별시', '서울시', '서울'],
  '경기': ['경기도', '경기'],
  '인천': ['인천광역시', '인천시', '인천'],
  '부산': ['부산광역시', '부산시', '부산'],
  '대구': ['대구광역시', '대구시', '대구'],
  '광주': ['광주광역시', '광주시', '광주'],
  '대전': ['대전광역시', '대전시', '대전'],
  '울산': ['울산광역시', '울산시', '울산'],
  '세종': ['세종특별자치시', '세종시', '세종'],
  '강원': ['강원특별자치도', '강원도', '강원'],
  '충북': ['충청북도', '충북'],
  '충남': ['충청남도', '충남'],
  '전북': ['전북특별자치도', '전라북도', '전북'],
  '전남': ['전라남도', '전남'],
  '경북': ['경상북도', '경북'],
  '경남': ['경상남도', '경남'],
  '제주': ['제주특별자치도', '제주도', '제주'],
};

const INCOME_KEYWORDS_LOW = ['기준중위소득', '차상위', '기초생활', '저소득'];

// household_type → 본문에서 찾을 한국어 키워드
const HOUSEHOLD_KEYWORDS: Record<string, string[]> = {
  'single_parent':    ['한부모', '한부모가정', '한부모가족'],
  'multi_child':      ['다자녀', '셋째', '3자녀'],
  'married':          ['신혼', '신혼부부'],
  'disabled_family':  ['장애', '장애인', '장애인가구'],
  'elderly_family':   ['독거노인', '고령가구', '경로'],
  'single':           ['1인가구', '독거'],
};

function regionMatches(programRegion: string | null | undefined, userRegion: string): boolean {
  if (!programRegion) return false;
  if (programRegion.includes('전국')) return true;
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  return aliases.some(a => programRegion.includes(a));
}

function isUrgentDeadline(applyEnd: string | null | undefined): boolean {
  if (!applyEnd) return false;
  const ms = new Date(applyEnd).getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 7;
}

export function scoreProgram<T extends ScorableItem>(
  program: T,
  user: UserSignals,
): ScoredItem<T> {
  const signals: MatchSignal[] = [];
  const haystack = `${program.title ?? ''} ${program.description ?? ''} ${program.source ?? ''}`;

  // 1) 지역 광역
  if (user.region && user.region !== '전국' && regionMatches(program.region, user.region)) {
    signals.push({ kind: 'region', score: 5 });
  }
  // 1-1) 지역 시군구 (광역 매칭됐을 때만 가산)
  if (user.district && program.district && program.district === user.district
      && signals.some(s => s.kind === 'region')) {
    signals.push({ kind: 'district', score: 5 });
  }

  // 2) BENEFIT_TAGS 교집합 — 일치당 +3
  if (user.benefitTags.length && program.benefit_tags?.length) {
    const overlap = user.benefitTags.filter(t => program.benefit_tags!.includes(t));
    if (overlap.length > 0) {
      signals.push({
        kind: 'benefit_tags',
        score: 3 * overlap.length,
        detail: overlap.join(', '),
      });
    }
  }

  // 3) 직업 키워드 — 본문 매칭
  if (user.occupation) {
    const keywords = OCCUPATION_KEYWORDS[user.occupation] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'occupation', score: 2 });
    }
  }

  // 4) 나이 키워드
  if (user.ageGroup) {
    const keywords = AGE_KEYWORDS[user.ageGroup] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'age', score: 1 });
    }
  }

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

  // 7) 마감 임박 — 다른 매칭이 1개 이상 있을 때만 tiebreaker +1
  if (signals.length > 0 && isUrgentDeadline(program.apply_end)) {
    signals.push({ kind: 'urgent_deadline', score: 1 });
  }

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  return { item: program, score, signals };
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

```bash
npx vitest run __tests__/personalization/score.test.ts
# Expected: PASS (12 tests)

git add lib/personalization/score.ts __tests__/personalization/score.test.ts
git commit -m "feat(personalization): score.ts — 8가지 시그널로 정책 1건 적합도 계산"
```

---

## Task 8: lib/personalization/filter.ts + 테스트

**Files:**
- Create: `lib/personalization/filter.ts`
- Test: `__tests__/personalization/filter.test.ts`

- [ ] **Step 1: 실패 테스트**

```ts
// __tests__/personalization/filter.test.ts
import { describe, it, expect } from 'vitest';
import { scoreAndFilter } from '@/lib/personalization/filter';
import type { UserSignals } from '@/lib/personalization/types';

const user: UserSignals = {
  ageGroup: '30대', region: '서울', district: null,
  occupation: '직장인', incomeLevel: null, householdTypes: [],
  benefitTags: ['주거'],
};

const programs = [
  { id: 'a', title: '서울 주거 지원', region: '서울특별시', benefit_tags: ['주거'] },
  { id: 'b', title: '부산 의료비', region: '부산광역시', benefit_tags: ['의료'] },
  { id: 'c', title: '전국 청년 일자리', region: '전국', description: '청년 직장인',
    benefit_tags: ['취업'] },
  { id: 'd', title: '서울 양육 지원', region: '서울', benefit_tags: ['양육'] },
];

describe('scoreAndFilter', () => {
  it('점수 ≥ minScore 만 반환', () => {
    const r = scoreAndFilter(programs, user, { minScore: 5, limit: 10 });
    // a: 지역(+5) + benefit(+3) = 8
    // b: 0 (제외)
    // c: 지역(+5) + 직장인(+2) + 청년(+1) = 8
    // d: 지역(+5) = 5
    expect(r.map(x => x.item.id)).toEqual(expect.arrayContaining(['a', 'c', 'd']));
    expect(r.find(x => x.item.id === 'b')).toBeUndefined();
  });

  it('점수 내림차순 정렬', () => {
    const r = scoreAndFilter(programs, user, { minScore: 1, limit: 10 });
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it('limit 제한', () => {
    const r = scoreAndFilter(programs, user, { minScore: 1, limit: 2 });
    expect(r.length).toBe(2);
  });

  it('빈 프로필 입력 → 빈 배열', () => {
    const r = scoreAndFilter(programs, {
      ageGroup: null, region: null, district: null, occupation: null,
      incomeLevel: null, householdTypes: [], benefitTags: [],
    }, { minScore: 5, limit: 10 });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run __tests__/personalization/filter.test.ts`
Expected: FAIL — 모듈 not found

- [ ] **Step 3: 구현**

```ts
// lib/personalization/filter.ts
// 정책 목록 → 점수 매겨 minScore 이상만 limit 까지 반환
import { scoreProgram, type ScorableItem } from './score';
import type { UserSignals, ScoredItem } from './types';

export type FilterOptions = {
  minScore: number;
  limit: number;
};

export function scoreAndFilter<T extends ScorableItem>(
  programs: T[],
  user: UserSignals,
  options: FilterOptions,
): ScoredItem<T>[] {
  return programs
    .map(p => scoreProgram(p, user))
    .filter(s => s.score >= options.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

```bash
npx vitest run __tests__/personalization/filter.test.ts
# Expected: PASS (4 tests)

git add lib/personalization/filter.ts __tests__/personalization/filter.test.ts
git commit -m "feat(personalization): filter.ts — minScore/limit 적용해 ScoredItem 배열 반환"
```

---

## Task 9: lib/personalization/load-profile.ts — React cache 로 1회만 조회

**Files:**
- Create: `lib/personalization/load-profile.ts`

- [ ] **Step 1: 구현**

```ts
// lib/personalization/load-profile.ts
// 로그인 사용자의 프로필을 SSR 1회 요청당 1번만 조회 (React cache)
// 페이지에서 PersonalizedSection + MatchBadge 가 동시에 호출해도 DB hit 1번
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { UserSignals } from './types';
import type {
  AgeOption,
  OccupationOption,
  RegionOption,
} from '@/lib/profile-options';
import type { BenefitTag } from '@/lib/tags/taxonomy';

export type LoadedProfile = {
  userId: string;
  displayName: string | null;
  signals: UserSignals;
  isEmpty: boolean;             // 모든 신호 필드가 비어있는지
  hasProfile: boolean;          // user_profiles row 자체가 존재하는지
  dismissedOnboardingAt: string | null;
};

export const loadUserProfile = cache(async (): Promise<LoadedProfile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`
      user_id, display_name, age_group, region, district, occupation,
      interests, income_level, household_types, benefit_tags,
      dismissed_onboarding_at
    `)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    return {
      userId: user.id,
      displayName: null,
      signals: {
        ageGroup: null, region: null, district: null, occupation: null,
        incomeLevel: null, householdTypes: [], benefitTags: [],
      },
      isEmpty: true,
      hasProfile: false,
      dismissedOnboardingAt: null,
    };
  }

  const signals: UserSignals = {
    ageGroup: (profile.age_group ?? null) as AgeOption | null,
    region: (profile.region ?? null) as RegionOption | null,
    district: profile.district ?? null,
    occupation: (profile.occupation ?? null) as OccupationOption | null,
    incomeLevel: (profile.income_level ?? null) as UserSignals['incomeLevel'],
    householdTypes: (profile.household_types ?? []) as string[],
    benefitTags: (profile.benefit_tags ?? []) as BenefitTag[],
  };

  const isEmpty =
    !signals.ageGroup && !signals.region && !signals.occupation &&
    !signals.incomeLevel && signals.householdTypes.length === 0 &&
    signals.benefitTags.length === 0;

  return {
    userId: user.id,
    displayName: profile.display_name ?? null,
    signals,
    isEmpty,
    hasProfile: true,
    dismissedOnboardingAt: profile.dismissed_onboarding_at ?? null,
  };
});
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/personalization/load-profile.ts
git commit -m "feat(personalization): load-profile.ts — React cache 로 SSR 1회 조회"
```

---

## Task 10: lib/personalization/auto-rule.ts — 자동 알림 규칙 생성·갱신

**Files:**
- Create: `lib/personalization/auto-rule.ts`

- [ ] **Step 1: 구현**

```ts
// lib/personalization/auto-rule.ts
// 사용자 프로필이 저장될 때 user_alert_rules 에 자동 규칙 1건 보장
// - 이미 있으면 갱신 (사용자 수동 규칙은 보존)
// - 사용자가 자동 규칙을 끄면(auto_rule_disabled_at) 다시 생성하지 않음
// - 모든 신호가 빈 값이면 생성 건너뜀 (전체 정책 매칭 → 스팸 방지)
import { createClient } from '@/lib/supabase/server';
import type { UserSignals } from './types';

type SyncOptions = {
  userId: string;
  signals: UserSignals;
  tier: 'free' | 'basic' | 'pro';
};

export async function syncAutoAlertRule(opts: SyncOptions): Promise<void> {
  const { userId, signals, tier } = opts;

  // 모든 신호가 비어있으면 자동 규칙 만들지 않음
  const hasAnySignal =
    signals.region || signals.ageGroup || signals.occupation ||
    signals.benefitTags.length > 0 || signals.householdTypes.length > 0;
  if (!hasAnySignal) return;

  const supabase = await createClient();

  // 기존 자동 규칙 확인
  const { data: existing } = await supabase
    .from('user_alert_rules')
    .select('id, auto_rule_disabled_at')
    .eq('user_id', userId)
    .eq('is_auto_generated', true)
    .maybeSingle();

  // 사용자가 자동 규칙을 직접 끔 → 다시 만들지 않음
  if (existing?.auto_rule_disabled_at) return;

  const channels = tier === 'pro' ? ['email', 'kakao'] : ['email'];
  const payload = {
    user_id: userId,
    name: '내 조건 맞춤 알림',
    region_tags: signals.region ? [signals.region] : [],
    age_tags: signals.ageGroup ? [signals.ageGroup] : [],
    occupation_tags: signals.occupation ? [signals.occupation] : [],
    benefit_tags: signals.benefitTags,
    household_tags: signals.householdTypes,
    channels,
    is_auto_generated: true,
    is_active: true,
  };

  if (existing) {
    // 갱신 (값 만 업데이트)
    await supabase
      .from('user_alert_rules')
      .update({
        region_tags: payload.region_tags,
        age_tags: payload.age_tags,
        occupation_tags: payload.occupation_tags,
        benefit_tags: payload.benefit_tags,
        household_tags: payload.household_tags,
        channels: payload.channels,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('user_alert_rules').insert(payload);
  }
}
```

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/personalization/auto-rule.ts
git commit -m "feat(personalization): auto-rule.ts — 프로필 저장 시 자동 알림 규칙 보장"
```

---

### 🚦 Section A 완료 — Deploy Checkpoint

```bash
git push origin master
# Vercel 자동 배포 → 사장님이 사이트 둘러보고 회귀 없는지 확인
# 변경 가시성: 사용자 화면 변화 0 (UI 미통합), DB 컬럼만 추가
```

---

# Section B — 입력 흐름

## Task 11: lib/profile-options.ts 확장 — INCOME / HOUSEHOLD 옵션

**Files:**
- Modify: `lib/profile-options.ts`

- [ ] **Step 1: 옵션 추가**

`lib/profile-options.ts` 끝에 다음 추가:

```ts
// 소득 구간 — 기준중위소득 비율 기반 단순화
// 정확한 수치 입력 회피 (진입장벽), 정책 매칭에 충분한 해상도
export const INCOME_OPTIONS = [
  { value: 'low',      label: '기초생활보장 수준 (기준중위소득 50% 이하)' },
  { value: 'mid_low',  label: '차상위 수준 (50~80%)' },
  { value: 'mid',      label: '중위 (80~120%)' },
  { value: 'mid_high', label: '중위 이상 (120~180%)' },
  { value: 'high',     label: '고소득 (180% 초과)' },
] as const;
export type IncomeOption = typeof INCOME_OPTIONS[number]['value'];

// 가구상태 — 다중 선택 가능 (한부모이자 다자녀 가능)
// value 는 영문(DB 컬럼 일관성), label 은 한글
export const HOUSEHOLD_OPTIONS = [
  { value: 'single',           label: '1인가구' },
  { value: 'married',          label: '신혼부부' },
  { value: 'single_parent',    label: '한부모가정' },
  { value: 'multi_child',      label: '다자녀가정' },
  { value: 'disabled_family',  label: '장애인가구' },
  { value: 'elderly_family',   label: '고령가구·독거노인' },
] as const;
export type HouseholdOption = typeof HOUSEHOLD_OPTIONS[number]['value'];
```

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add lib/profile-options.ts
git commit -m "feat(personalization): profile-options 에 INCOME/HOUSEHOLD 옵션 추가"
```

---

## Task 12: 마이페이지 profile-form.tsx 확장 — 소득/가구상태 필드

**Files:**
- Modify: `app/mypage/profile-form.tsx`

> 기존 form 의 패턴(칩 UI, 단일/다중 선택)을 따라 소득(단일)·가구상태(다중) 필드 추가. 저장 시 `syncAutoAlertRule()` 호출도 같이 묶음.

- [ ] **Step 1: 기존 폼 구조 파악**

Run: `cat app/mypage/profile-form.tsx | head -100`
확인할 것: 어디에 income/household 필드를 끼워넣을지, server action 함수명, 폼 상태 관리 패턴

- [ ] **Step 2: import + state 추가**

`app/mypage/profile-form.tsx` 의 import 부분에:

```ts
import {
  INCOME_OPTIONS, HOUSEHOLD_OPTIONS,
  type IncomeOption, type HouseholdOption,
} from '@/lib/profile-options';
```

기존 useState 옆에:

```ts
const [incomeLevel, setIncomeLevel] = useState<IncomeOption | null>(
  (initialProfile?.income_level as IncomeOption | null) ?? null
);
const [householdTypes, setHouseholdTypes] = useState<HouseholdOption[]>(
  (initialProfile?.household_types as HouseholdOption[] | null) ?? []
);
```

- [ ] **Step 3: 폼 UI — 관심사 섹션 위에 추가**

기존 "관심사" 섹션 바로 위에:

```tsx
{/* 소득 수준 (단일 선택, 선택사항) */}
<section className="space-y-2">
  <label className="text-sm font-medium">
    소득 수준 <span className="text-xs text-zinc-500">(선택)</span>
  </label>
  <p className="text-xs text-zinc-500">
    이 정보는 맞춤 추천에만 사용되며 외부에 제공되지 않습니다.
  </p>
  <div className="flex flex-col gap-2">
    {INCOME_OPTIONS.map(opt => (
      <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          name="income_level"
          value={opt.value}
          checked={incomeLevel === opt.value}
          onChange={() => setIncomeLevel(opt.value)}
          className="mt-0.5"
        />
        <span className="text-sm">{opt.label}</span>
      </label>
    ))}
    <button
      type="button"
      onClick={() => setIncomeLevel(null)}
      className="text-xs text-zinc-500 underline self-start"
    >
      선택 안 함
    </button>
  </div>
</section>

{/* 가구상태 (다중 선택, 민감정보) */}
<section className="space-y-2">
  <label className="text-sm font-medium">
    가구 상태 <span className="text-xs text-zinc-500">(다중 선택 · 선택)</span>
  </label>
  <p className="text-xs text-zinc-500">
    민감정보로 분류되며 맞춤 추천에만 사용됩니다.
  </p>
  <div className="flex flex-wrap gap-2">
    {HOUSEHOLD_OPTIONS.map(opt => {
      const checked = householdTypes.includes(opt.value);
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => setHouseholdTypes(prev =>
            checked ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
          )}
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
</section>
```

- [ ] **Step 4: 저장 핸들러 확장**

기존 server action 호출 부분에 두 필드 추가:

```ts
await updateProfile({
  age_group: ageGroup,
  region,
  district,
  occupation,
  interests,
  income_level: incomeLevel,
  household_types: householdTypes,
});
```

- [ ] **Step 5: server action 도 두 필드 받도록 수정**

해당 server action (보통 `app/mypage/actions.ts` 또는 폼 파일 안 `'use server'` 함수) 의 인자 타입에 `income_level`, `household_types` 추가하고 supabase upsert 에 그대로 전달.

- [ ] **Step 6: 빌드 확인 + 커밋**

```bash
npm run build
# Expected: 빌드 성공

git add app/mypage/profile-form.tsx app/mypage/actions.ts
git commit -m "feat(personalization): 마이페이지 profile-form 에 소득/가구상태 필드"
```

---

## Task 13: profile-form 저장 시 자동 알림 규칙 동기화

**Files:**
- Modify: `app/mypage/actions.ts` (또는 profile-form 의 server action 위치)

- [ ] **Step 1: server action 끝부분에 syncAutoAlertRule 호출 추가**

upsert 성공 후:

```ts
import { syncAutoAlertRule } from '@/lib/personalization/auto-rule';
import { interestsToBenefitTags } from '@/lib/personalization/interest-mapping';
// ...

// 프로필 저장 성공 후 자동 알림 규칙 동기화
const tier = await getUserTier(userId);  // 기존 helper, 없으면 'free' 기본
await syncAutoAlertRule({
  userId,
  tier,
  signals: {
    ageGroup: payload.age_group,
    region: payload.region,
    district: payload.district,
    occupation: payload.occupation,
    incomeLevel: payload.income_level,
    householdTypes: payload.household_types,
    benefitTags: interestsToBenefitTags(payload.interests),
  },
});
```

> getUserTier 가 기존에 없다면 `subscriptions` 테이블에서 직접 조회. tier 정보는 자동 규칙의 channels 결정에만 사용.

- [ ] **Step 2: 빌드 + 수동 테스트**

`npm run build` 통과 확인 후:
1. /mypage 에서 프로필 저장
2. Supabase Dashboard → user_alert_rules 에서 `is_auto_generated=true` row 1건 생성 확인
3. 다시 프로필 수정·저장 → 같은 row 가 갱신 (새 row 추가 안 됨) 확인

- [ ] **Step 3: 커밋**

```bash
git add app/mypage/actions.ts
git commit -m "feat(personalization): 프로필 저장 시 자동 알림 규칙 동기화"
```

---

## Task 14: 온보딩 페이지 skeleton — /onboarding 라우트

**Files:**
- Create: `app/onboarding/page.tsx`
- Create: `app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: 서버 컴포넌트 (page.tsx)**

```tsx
// app/onboarding/page.tsx
// 가입 직후 또는 사용자가 직접 진입한 5단계 온보딩
// - 프로필이 이미 채워져 있으면 그대로 다시 입력 (수정 가능)
// - dismissed_onboarding_at 이 NULL 이면 첫 진입
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow } from './onboarding-flow';

export const metadata = { title: '온보딩 — keepioo' };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('age_group, region, district, occupation, interests, income_level, household_types')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <OnboardingFlow
          userId={user.id}
          initial={{
            ageGroup: profile?.age_group ?? null,
            region: profile?.region ?? null,
            district: profile?.district ?? null,
            occupation: profile?.occupation ?? null,
            interests: profile?.interests ?? [],
            incomeLevel: (profile?.income_level ?? null) as any,
            householdTypes: (profile?.household_types ?? []) as any,
          }}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: client flow 컴포넌트 (skeleton)**

```tsx
// app/onboarding/onboarding-flow.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepAge } from './steps/step-age';
import { StepRegion } from './steps/step-region';
import { StepOccupation } from './steps/step-occupation';
import { StepIncome } from './steps/step-income';
import { StepInterests } from './steps/step-interests';
import type {
  AgeOption, RegionOption, OccupationOption,
  IncomeOption, HouseholdOption,
} from '@/lib/profile-options';
import { saveOnboardingProfile } from './actions';

export type OnboardingState = {
  ageGroup: AgeOption | null;
  region: RegionOption | null;
  district: string | null;
  occupation: OccupationOption | null;
  incomeLevel: IncomeOption | null;
  householdTypes: HouseholdOption[];
  interests: string[];
};

const TOTAL_STEPS = 5;

export function OnboardingFlow({
  userId, initial,
}: {
  userId: string;
  initial: OnboardingState;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>(initial);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  async function finish() {
    setSaving(true);
    await saveOnboardingProfile(userId, state);
    setSaving(false);
    router.push('/mypage?onboarded=1');
    router.refresh();
  }

  function next() {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else finish();
  }
  function skip() { next(); }
  function back() { if (step > 1) setStep(s => s - 1); }

  return (
    <div className="space-y-6">
      {/* 진행 바 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < step ? 'bg-emerald-600' : 'bg-zinc-200'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-500">{step}/{TOTAL_STEPS}</p>
      </div>

      {step === 1 && (
        <StepAge value={state.ageGroup} onChange={v => update('ageGroup', v)} />
      )}
      {step === 2 && (
        <StepRegion
          region={state.region}
          district={state.district}
          onChange={(r, d) => { update('region', r); update('district', d); }}
        />
      )}
      {step === 3 && (
        <StepOccupation value={state.occupation} onChange={v => update('occupation', v)} />
      )}
      {step === 4 && (
        <StepIncome value={state.incomeLevel} onChange={v => update('incomeLevel', v)} />
      )}
      {step === 5 && (
        <StepInterests
          interests={state.interests}
          householdTypes={state.householdTypes}
          onChange={(i, h) => { update('interests', i); update('householdTypes', h); }}
        />
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={back}
          disabled={step === 1 || saving}
          className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-30"
        >
          ← 이전
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={skip}
            disabled={saving}
            className="text-sm text-zinc-500 hover:text-zinc-700 px-3 py-1.5"
          >
            건너뛰기
          </button>
          <button
            onClick={next}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {step === TOTAL_STEPS ? (saving ? '저장 중…' : '완료') : '다음 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: server action**

```ts
// app/onboarding/actions.ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { syncAutoAlertRule } from '@/lib/personalization/auto-rule';
import { interestsToBenefitTags } from '@/lib/personalization/interest-mapping';
import type { OnboardingState } from './onboarding-flow';

export async function saveOnboardingProfile(userId: string, state: OnboardingState) {
  const supabase = await createClient();

  // 인증 재확인 (server action 보안)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // upsert + dismissed_onboarding_at 도장
  await supabase.from('user_profiles').upsert({
    user_id: userId,
    age_group: state.ageGroup,
    region: state.region,
    district: state.district,
    occupation: state.occupation,
    interests: state.interests,
    income_level: state.incomeLevel,
    household_types: state.householdTypes,
    dismissed_onboarding_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  // 자동 알림 규칙 동기화
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();

  await syncAutoAlertRule({
    userId,
    tier: (sub?.tier ?? 'free') as 'free' | 'basic' | 'pro',
    signals: {
      ageGroup: state.ageGroup,
      region: state.region,
      district: state.district,
      occupation: state.occupation,
      incomeLevel: state.incomeLevel,
      householdTypes: state.householdTypes,
      benefitTags: interestsToBenefitTags(state.interests),
    },
  });
}
```

- [ ] **Step 4: 빌드 확인 + 커밋**

```bash
npm run build
git add app/onboarding/page.tsx app/onboarding/onboarding-flow.tsx app/onboarding/actions.ts
git commit -m "feat(personalization): /onboarding 페이지 + flow skeleton + server action"
```

---

## Task 15: 5개 step 컴포넌트

**Files:**
- Create: `app/onboarding/steps/step-age.tsx`
- Create: `app/onboarding/steps/step-region.tsx`
- Create: `app/onboarding/steps/step-occupation.tsx`
- Create: `app/onboarding/steps/step-income.tsx`
- Create: `app/onboarding/steps/step-interests.tsx`

> 모두 client component, 동일한 패턴: 제목 + 안내 + 칩/라디오 UI + onChange 콜백

- [ ] **Step 1: step-age.tsx**

```tsx
// app/onboarding/steps/step-age.tsx
'use client';
import { AGE_OPTIONS, type AgeOption } from '@/lib/profile-options';

export function StepAge({
  value, onChange,
}: { value: AgeOption | null; onChange: (v: AgeOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">나이대를 골라주세요</h2>
      <p className="text-sm text-zinc-600">맞춤 정책을 보여드릴게요.</p>
      <div className="flex flex-wrap gap-2">
        {AGE_OPTIONS.map(age => (
          <button
            key={age}
            onClick={() => onChange(value === age ? null : age)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              value === age
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
            }`}
          >
            {age}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: step-region.tsx**

```tsx
// app/onboarding/steps/step-region.tsx
'use client';
import {
  REGION_OPTIONS, getDistrictsForRegion,
  type RegionOption,
} from '@/lib/profile-options';

export function StepRegion({
  region, district, onChange,
}: {
  region: RegionOption | null;
  district: string | null;
  onChange: (r: RegionOption | null, d: string | null) => void;
}) {
  const districts = region ? getDistrictsForRegion(region) : [];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">거주 지역은요?</h2>
      <div className="space-y-2">
        <label className="text-sm font-medium">시·도</label>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map(r => (
            <button
              key={r}
              onClick={() => onChange(region === r ? null : (r as RegionOption), null)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                region === r
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {districts.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">시·군·구 (선택)</label>
          <select
            value={district ?? ''}
            onChange={(e) => onChange(region, e.target.value || null)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">선택 안 함</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: step-occupation.tsx**

```tsx
// app/onboarding/steps/step-occupation.tsx
'use client';
import { OCCUPATION_OPTIONS, type OccupationOption } from '@/lib/profile-options';

export function StepOccupation({
  value, onChange,
}: { value: OccupationOption | null; onChange: (v: OccupationOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">현재 직업·상황은요?</h2>
      <div className="flex flex-wrap gap-2">
        {OCCUPATION_OPTIONS.map(occ => (
          <button
            key={occ}
            onClick={() => onChange(value === occ ? null : occ)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              value === occ
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
            }`}
          >
            {occ}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: step-income.tsx**

```tsx
// app/onboarding/steps/step-income.tsx
'use client';
import { INCOME_OPTIONS, type IncomeOption } from '@/lib/profile-options';

export function StepIncome({
  value, onChange,
}: { value: IncomeOption | null; onChange: (v: IncomeOption | null) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">소득 수준 (선택)</h2>
      <p className="text-xs text-zinc-500">
        이 정보는 맞춤 추천에만 사용되며 외부에 제공되지 않습니다.
      </p>
      <div className="flex flex-col gap-2">
        {INCOME_OPTIONS.map(opt => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-zinc-50">
            <input
              type="radio"
              name="income_level"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5"
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-zinc-500 underline self-start mt-2"
        >
          선택 안 함
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: step-interests.tsx (관심사 + 가구상태)**

```tsx
// app/onboarding/steps/step-interests.tsx
'use client';
import { HOUSEHOLD_OPTIONS, type HouseholdOption } from '@/lib/profile-options';

const INTEREST_LABELS = [
  '주거', '의료/건강', '취업/창업', '양육/보육', '교육',
  '복지/생계', '문화/여가', '교통', '법률/상담',
] as const;

export function StepInterests({
  interests, householdTypes, onChange,
}: {
  interests: string[];
  householdTypes: HouseholdOption[];
  onChange: (i: string[], h: HouseholdOption[]) => void;
}) {
  function toggleInterest(label: string) {
    const next = interests.includes(label)
      ? interests.filter(i => i !== label)
      : [...interests, label];
    onChange(next, householdTypes);
  }
  function toggleHousehold(value: HouseholdOption) {
    const next = householdTypes.includes(value)
      ? householdTypes.filter(h => h !== value)
      : [...householdTypes, value];
    onChange(interests, next);
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-xl font-bold">관심 있는 분야 (다중 선택)</h2>
        <div className="flex flex-wrap gap-2">
          {INTEREST_LABELS.map(label => {
            const checked = interests.includes(label);
            return (
              <button
                key={label}
                onClick={() => toggleInterest(label)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  checked
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-emerald-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-base font-semibold">가구 상태 (선택)</h2>
        <p className="text-xs text-zinc-500">
          민감정보로 분류되며 맞춤 추천에만 사용됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {HOUSEHOLD_OPTIONS.map(opt => {
            const checked = householdTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleHousehold(opt.value)}
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
    </div>
  );
}
```

- [ ] **Step 6: 빌드 + 수동 확인 + 커밋**

```bash
npm run build
# Vercel 배포 후 /onboarding 직접 진입해서 5단계 모두 동작 확인 (개발 환경 OK)

git add app/onboarding/steps/
git commit -m "feat(personalization): 5개 step 컴포넌트 (age/region/occupation/income/interests)"
```

---

## Task 16: 첫 로그인 시 /onboarding 자동 redirect

**Files:**
- Modify: `app/auth/callback/route.ts` (또는 동일 역할의 라우트)

> 가입 후 이메일 인증 → 첫 로그인 콜백에서 dismissed_onboarding_at 체크 → NULL 이면 /onboarding 으로

- [ ] **Step 1: 콜백 라우트 위치 확인**

Run: `find app/ -name "route.ts" | xargs grep -l "auth.*callback\|exchangeCodeForSession" 2>/dev/null | head -3`

- [ ] **Step 2: redirect 로직 추가**

세션 교환 성공 후 user_profiles 조회 → dismissed_onboarding_at 이 NULL 이면 `/onboarding` 으로:

```ts
// 세션 교환 후
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('dismissed_onboarding_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // user_profiles row 가 없거나 dismissed_onboarding_at 이 NULL → 첫 진입
  if (!profile || !profile.dismissed_onboarding_at) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }
}
return NextResponse.redirect(new URL('/mypage', request.url));
```

> 기존 redirect 목적지 (보통 /mypage 또는 /) 는 보존하고 onboarding 분기만 앞에 끼워넣음.

- [ ] **Step 3: 빌드 + 신규 가입 시나리오 수동 확인 + 커밋**

```bash
npm run build
# 테스트 계정으로 신규 가입 → 인증 → /onboarding 으로 자동 이동 확인

git add app/auth/callback/route.ts
git commit -m "feat(personalization): 첫 로그인 시 /onboarding 자동 redirect"
```

---

## Task 17: 마이페이지 "온보딩 다시 하기" 링크

**Files:**
- Modify: `app/mypage/page.tsx` (또는 마이페이지 헤더 컴포넌트)

- [ ] **Step 1: 링크 추가**

마이페이지의 적당한 위치 (프로필 카드 아래 또는 헤더 우측):

```tsx
<a
  href="/onboarding"
  className="text-xs text-emerald-700 underline hover:text-emerald-900"
>
  온보딩 다시 하기
</a>
```

- [ ] **Step 2: 커밋**

```bash
git add app/mypage/page.tsx
git commit -m "feat(personalization): 마이페이지에 온보딩 재진입 링크"
```

---

### 🚦 Section B 완료 — Deploy Checkpoint

```bash
git push origin master
# Vercel 자동 배포 → 사장님 검수:
# 1. 신규 가입 → 자동 /onboarding 진입 → 5단계 동작 OK?
# 2. 마이페이지에서 소득/가구상태 폼 OK?
# 3. 프로필 저장 후 user_alert_rules 에 자동 규칙 1건 생성됐는지?
```

---

# Section C — 노출 통합

## Task 18: components/personalization/PersonalizedSection.tsx

**Files:**
- Create: `components/personalization/PersonalizedSection.tsx`

> welfare/loan/news/blog 모두 재사용. 영역마다 카드 모양이 달라서, render prop 패턴으로 카드 컴포넌트를 받도록 설계.

- [ ] **Step 1: 구현**

```tsx
// components/personalization/PersonalizedSection.tsx
// "🌟 ○○님께 맞는 정책" 분리 섹션
// render prop 으로 카드 컴포넌트를 받아 영역별(welfare/loan/news/blog) 재사용
import type { ScoredItem } from '@/lib/personalization/types';
import type { ScorableItem } from '@/lib/personalization/score';

type Props<T extends ScorableItem> = {
  items: ScoredItem<T>[];
  userName?: string | null;
  renderCard: (item: T, signals: ScoredItem<T>['signals']) => React.ReactNode;
  totalLink?: { href: string; label: string };  // "전체 보기" 링크 (선택)
};

export function PersonalizedSection<T extends ScorableItem>({
  items, userName, renderCard, totalLink,
}: Props<T>) {
  if (items.length === 0) return null;
  const greeting = userName ? `${userName}님께` : '회원님께';

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-lg font-bold text-zinc-900">
          🌟 {greeting} 맞는 정책
          <span className="ml-2 text-xs text-zinc-500 font-normal">프로필 기반 · {items.length}건</span>
        </h2>
        {totalLink && (
          <a
            href={totalLink.href}
            className="text-xs text-emerald-700 hover:text-emerald-900 underline"
          >
            {totalLink.label} →
          </a>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(({ item, signals }) => (
          <div key={item.id}>{renderCard(item, signals)}</div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add components/personalization/PersonalizedSection.tsx
git commit -m "feat(personalization): PersonalizedSection — 분리 섹션 공통 컴포넌트"
```

---

## Task 19: components/personalization/EmptyProfilePrompt.tsx

**Files:**
- Create: `components/personalization/EmptyProfilePrompt.tsx`

- [ ] **Step 1: 구현**

```tsx
// components/personalization/EmptyProfilePrompt.tsx
// 로그인했지만 프로필 비어있는 사용자에게 온보딩 유도
import Link from 'next/link';

export function EmptyProfilePrompt({ href = '/onboarding' }: { href?: string }) {
  return (
    <div className="mb-6 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 sm:p-5">
      <p className="text-sm text-emerald-900 font-medium">
        프로필을 채우면 맞춤 정책을 보여드려요
      </p>
      <p className="text-xs text-emerald-700 mt-1">
        나이·지역·관심사 입력 1분 — 내 조건에 맞는 정책만 골라보세요.
      </p>
      <Link
        href={href}
        className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
      >
        프로필 채우기 →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/personalization/EmptyProfilePrompt.tsx
git commit -m "feat(personalization): EmptyProfilePrompt — 빈 프로필 사용자 온보딩 유도"
```

---

## Task 20: components/personalization/MatchBadge.tsx

**Files:**
- Create: `components/personalization/MatchBadge.tsx`

- [ ] **Step 1: 구현**

```tsx
// components/personalization/MatchBadge.tsx
// 전체 리스트의 매칭 항목에 ✨ 배지 (한 줄, 작게)
export function MatchBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 leading-none">
      ✨ 내 조건
    </span>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/personalization/MatchBadge.tsx
git commit -m "feat(personalization): MatchBadge — 전체 리스트의 매칭 항목 배지"
```

---

## Task 21: app/welfare/page.tsx — 분리 섹션 통합

**Files:**
- Modify: `app/welfare/page.tsx`

> welfare 페이지의 기존 SSR 흐름은 유지. 그 위에 loadUserProfile + scoreAndFilter 로 분리 섹션만 얹는다.

- [ ] **Step 1: 기존 페이지 구조 파악**

```bash
cat app/welfare/page.tsx | head -60
```
welfare card 컴포넌트 이름 확인 (예: WelfareCard, WelfareListItem 등)

- [ ] **Step 2: import 추가**

```tsx
import { loadUserProfile } from '@/lib/personalization/load-profile';
import { scoreAndFilter } from '@/lib/personalization/filter';
import {
  PERSONAL_SECTION_MIN_SCORE,
  PERSONAL_SECTION_MAX_ITEMS,
} from '@/lib/personalization/types';
import { PersonalizedSection } from '@/components/personalization/PersonalizedSection';
import { EmptyProfilePrompt } from '@/components/personalization/EmptyProfilePrompt';
import { MatchBadge } from '@/components/personalization/MatchBadge';
```

- [ ] **Step 3: 데이터 fetch 후 점수 계산**

기존 `const programs = await fetchWelfarePrograms(...)` 직후:

```tsx
const profile = await loadUserProfile();

const personalSection = profile && !profile.isEmpty
  ? scoreAndFilter(programs, profile.signals, {
      minScore: PERSONAL_SECTION_MIN_SCORE,
      limit: PERSONAL_SECTION_MAX_ITEMS,
    })
  : [];

const personalIds = new Set(personalSection.map(s => s.item.id));
```

- [ ] **Step 4: 렌더 트리에 분리 섹션 + 배지 끼워넣기**

기존 `<CategoryChipBar />` 와 전체 리스트 사이에:

```tsx
{/* 맞춤 분리 섹션 */}
{personalSection.length > 0 ? (
  <PersonalizedSection
    items={personalSection}
    userName={profile?.displayName}
    renderCard={(p) => <WelfareCard program={p} />}  // 기존 카드 그대로
  />
) : profile && profile.isEmpty ? (
  <EmptyProfilePrompt />
) : null}

{/* 전체 리스트 — 기존 그대로, 매칭 항목에 배지만 추가 */}
<section>
  <h2 className="text-lg font-bold mb-3">전체 정책 (마감일순)</h2>
  <ul>
    {programs.map(p => (
      <li key={p.id}>
        <WelfareCard program={p} />
        {personalIds.has(p.id) && <MatchBadge />}
      </li>
    ))}
  </ul>
</section>
```

> WelfareCard 의 실제 prop 구조에 맞춰 조정. MatchBadge 는 카드 안에 끼우는게 더 자연스러우면 카드 컴포넌트 시그니처를 살짝 확장 (예: `<WelfareCard program={p} matched={personalIds.has(p.id)} />`).

- [ ] **Step 5: 빌드 + 사용자 시나리오 4개 수동 검증**

```bash
npm run build
```

수동 검증:
1. 비로그인으로 /welfare → 분리 섹션 안 보임, 전체 리스트만 (회귀 0)
2. 로그인 + 빈 프로필 → EmptyProfilePrompt 보임
3. 로그인 + 프로필 채워짐 + 매칭 0건 → 분리 섹션 안 보임, 전체에 배지도 0개
4. 로그인 + 프로필 + 매칭 있음 → 분리 섹션 + 전체 리스트 ✨

- [ ] **Step 6: 커밋**

```bash
git add app/welfare/page.tsx
git commit -m "feat(personalization): welfare 페이지 통합 — 분리 섹션 + 전체 + 배지"
```

---

## Task 22: 홈 카드 강화 — components/home-recommend-card.tsx + app/page.tsx

**Files:**
- Modify: `components/home-recommend-card.tsx`
- Modify: `app/page.tsx`

> 기존 HomeRecommendCard 는 입력 폼 카드. 로그인 + 프로필 채워진 사용자에게는 자동 결과 카드로 교체.

- [ ] **Step 1: 기존 컴포넌트 구조 파악**

```bash
cat components/home-recommend-card.tsx | head -80
```

- [ ] **Step 2: 분기용 새 컴포넌트 만들기**

`components/home-recommend-card.tsx` 또는 같은 디렉터리에 신규 파일 (취향) — 여기서는 같은 파일에 분기 로직 추가:

```tsx
// 기존 HomeRecommendCard 위/옆에 새 컴포넌트
import { loadUserProfile } from '@/lib/personalization/load-profile';
import { scoreAndFilter } from '@/lib/personalization/filter';
import {
  PERSONAL_SECTION_MIN_SCORE,
} from '@/lib/personalization/types';
import { PersonalizedSection } from '@/components/personalization/PersonalizedSection';
import { EmptyProfilePrompt } from '@/components/personalization/EmptyProfilePrompt';

// 로그인 + 프로필 있는 사용자에게 자동 결과 카드 보여줌
// fetchTopWelfare 는 홈에서 이미 호출 중인 함수면 재사용, 아니면 간단히 상위 30건 fetch
export async function HomeRecommendAuto({ programs }: { programs: any[] }) {
  const profile = await loadUserProfile();
  if (!profile) return null;  // 비로그인은 다른 카드 표시
  if (profile.isEmpty) return <EmptyProfilePrompt />;

  const items = scoreAndFilter(programs, profile.signals, {
    minScore: PERSONAL_SECTION_MIN_SCORE,
    limit: 5,
  });
  if (items.length === 0) return null;

  return (
    <PersonalizedSection
      items={items}
      userName={profile.displayName}
      totalLink={{ href: '/welfare', label: '전체 보기' }}
      renderCard={(p) => (
        <a href={`/welfare/${p.id}`} className="block p-3 border rounded-lg hover:border-emerald-400">
          <h3 className="text-sm font-medium line-clamp-2">{p.title}</h3>
          {p.apply_end && (
            <p className="text-xs text-zinc-500 mt-1">마감 {p.apply_end}</p>
          )}
        </a>
      )}
    />
  );
}
```

- [ ] **Step 3: app/page.tsx 에서 분기 호출**

기존 HomeRecommendCard 호출 부분 위/대신:

```tsx
import { loadUserProfile } from '@/lib/personalization/load-profile';
import { HomeRecommendAuto } from '@/components/home-recommend-card';

// ...
const profile = await loadUserProfile();
const topPrograms = await fetchTopWelfare(30);  // 기존 함수 또는 신규

return (
  <main>
    {/* 기타 홈 섹션들 */}

    {profile ? (
      <HomeRecommendAuto programs={topPrograms} />
    ) : (
      <HomeRecommendCard /* 기존 입력 유도 카드 — 비로그인 */ />
    )}

    {/* 기타 */}
  </main>
);
```

- [ ] **Step 4: 빌드 + 수동 확인 + 커밋**

```bash
npm run build
# 확인:
# - 비로그인 홈: 기존 입력 카드
# - 로그인 + 빈 프로필: EmptyProfilePrompt
# - 로그인 + 채워진 프로필: 자동 추천 5건 카드 + "전체 보기 → /welfare"

git add components/home-recommend-card.tsx app/page.tsx
git commit -m "feat(personalization): 홈 카드 분기 — 로그인+프로필이면 자동 추천 카드"
```

---

## Task 23: 개인정보 처리방침 업데이트

**Files:**
- Modify: `app/privacy/page.tsx`

- [ ] **Step 1: 현 처리방침 확인**

```bash
cat app/privacy/page.tsx | head -60
```

- [ ] **Step 2: 신규 수집 항목 명시**

"수집 항목" 섹션에 다음 추가:

```
- 소득 수준 (선택, 5단계 구간 — 기준중위소득 비율)
- 가구 상태 (선택, 다중 — 1인가구/신혼/한부모/다자녀/장애가구/고령가구)

수집 목적: 맞춤형 정책 추천 제공 (외부 제공 없음, 회원 탈퇴 시 즉시 삭제)
```

가구상태는 민감정보 분류 안내도 함께:

```
가구상태 항목은 「개인정보 보호법」상 민감정보로 분류될 수 있으며, 사용자의
명시적 입력 동의를 전제로 맞춤 추천 목적에만 사용됩니다.
```

- [ ] **Step 3: 마지막 개정일 갱신 + 커밋**

```bash
git add app/privacy/page.tsx
git commit -m "docs(privacy): 소득/가구상태 수집 항목 명시 (맞춤 추천 목적)"
```

---

## Task 24: 통합 QA — 5가지 시나리오 수동 검증

**Files:** (없음 — 검증만)

> 모든 코드가 들어간 후 master 푸시 전 마지막 게이트.

- [ ] **Step 1: 시나리오 1 — 신규 가입 풀 플로우**

1. 새 이메일로 가입
2. 이메일 인증 후 첫 로그인
3. **자동으로 /onboarding 진입** 확인
4. 5단계 모두 입력 후 "완료"
5. /mypage 로 이동 + `?onboarded=1` query 확인
6. /welfare 진입 → **분리 섹션 + 전체 리스트** 보임 확인
7. Supabase user_alert_rules 에서 `is_auto_generated=true` 1건 확인

- [ ] **Step 2: 시나리오 2 — 신규 가입 + 모두 건너뛰기**

1. 새 이메일로 가입
2. /onboarding 에서 5단계 모두 "건너뛰기"
3. /welfare 진입 → **EmptyProfilePrompt** 보임, 분리 섹션 없음, 전체 리스트는 정상

- [ ] **Step 3: 시나리오 3 — 비로그인**

1. 시크릿 창으로 /welfare 진입
2. **회귀 0** — 분리 섹션 없음, EmptyProfilePrompt 없음, 기존 마감일순 그대로

- [ ] **Step 4: 시나리오 4 — 프로필 일부만**

1. 기존 계정에서 마이페이지 → 지역만 채우고 저장
2. /welfare 진입 → 지역 일치 정책만 분리 섹션에 (점수 +5) 표시
3. 나이·관심사 추가 후 저장 → 분리 섹션 항목 늘어남 확인

- [ ] **Step 5: 시나리오 5 — 자동 알림 수신**

1. 시나리오 1 의 신규 사용자 (자동 규칙 보유)
2. Supabase 에서 alert_dispatch 임의 트리거 (또는 다음 cron 까지 대기)
3. 이메일 수신함 확인 → 본인 조건에 맞는 정책만 도착했는지

- [ ] **Step 6: 모든 통과 시 master push**

```bash
git push origin master
# Vercel 배포 완료 후 사장님이 production 에서 한 번 더 확인
```

---

## 자체 리뷰 체크포인트 (subagent / 사장님)

- [ ] spec §1 의 4가지 답답함 모두 해결됐나? (피드 동일 → Task 21, 홈 추천 → Task 22, 온보딩 → Task 14–16, interests 무용지물 → Task 2 + 6 + 21)
- [ ] spec §3-6 의 데이터 한계 (income_max/household_target 컬럼 부재) 가 score.ts (Task 7) 에서 본문 정규식으로 처리됐나?
- [ ] 공통 인프라가 영역 독립적인가? (Task 18 PersonalizedSection 의 render prop, Task 9 load-profile 의 React cache)
- [ ] 비로그인 사용자 회귀 0 검증 (시나리오 3)
- [ ] 자동 알림 규칙이 빈 프로필에서 안 만들어지나? (Task 10 의 hasAnySignal 가드)
- [ ] 사용자가 자동 규칙 직접 끄면 다시 생성 안 되나? (Task 10 의 auto_rule_disabled_at 체크)

---

## 향후 작업 (이 plan 범위 외)

- **Phase 1.5**: collector 단계에서 정책 본문 분석해 `income_target_level`, `household_target_tags` 컬럼 자동 채움 → score.ts 의 정확 매칭으로 전환
- **Phase 2**: loan / news / blog 페이지에 같은 공통 인프라 적용 (각 1–2일 분량, 별도 plan 작성)
- **Phase 3**: 사용자 행동 로그 기반 학습 (북마크·클릭 신호로 가중치 자동 조정)
