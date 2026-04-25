# 사용자별 맞춤형 정보 제공 — 설계 문서

- **작성일**: 2026-04-25
- **작성자**: Claude Code (사장님 의뢰)
- **상태**: spec 작성 완료, 사장님 검토 대기
- **구현 전략**: B 옵션 (수직 슬라이스 — welfare → loan → news → blog 순)

---

## 1. 개요와 목표

### 1-1. 문제

사용자가 마이페이지에서 프로필(나이·지역·직업·관심사)을 입력해도 keepioo 어디서도 그 결과를 볼 수 없다. 현재 4가지 답답함이 동시에 발생한다.

| # | 답답함 | 원인 |
|---|---|---|
| ① | 메인 피드(welfare/loan/news/blog) 가 모두 동일 | 4개 페이지 SSR 로직이 user profile 을 조회조차 안 함 |
| ② | 홈에 맞춤 추천 부재 | HomeRecommendCard 가 입력 폼만 제공, 자동 결과 노출 없음 |
| ③ | 가입해도 별 차이 없음 | 가입 직후 온보딩 없음, 마이페이지까지 직접 가야 함 |
| ④ | interests 가 무용지물 | 9개 옵션이 BENEFIT_TAGS 14종과 매핑 안 됨 → 어디에도 사용 안 됨 |

### 1-2. 목표

- 가입 후 **5분 안에** 사용자가 "내 조건에 맞는 정책" 을 자기 화면에서 본다
- 프로필 1개 필드만 채워도 즉시 효과가 보이도록 **점진적 가치 전달**
- **수직 슬라이스**: welfare 부터 100% 완성 → loan → news → blog 순. 단 공통 인프라(`lib/personalization/*`)는 처음부터 영역 독립적으로 설계해 후속 영역 확장 시 재사용

### 1-3. 비목표 (YAGNI)

- AI 기반 자연어 추천 (룰 기반으로 충분)
- 사용자 행동 로그 기반 협업 필터링 (데이터 부족, 미래 과제)
- 모바일 네이티브 앱 (웹만)
- 영역 간 교차 추천 (welfare 보면 관련 loan 도 띄우기 등)

---

## 2. 사용자 시나리오

| 시나리오 | 현재 | 변경 후 |
|---|---|---|
| 신규 가입 직후 | 빈 마이페이지로 던져짐 | `/onboarding` 5단계 자동 진입, 1단계만 채워도 맞춤 결과 즉시 |
| 홈 방문 (로그인) | 일반 인기 정책만 | 상단에 "○○님께 맞는 정책 5건" 자동 카드 |
| welfare 페이지 방문 | 마감일순 50건 | 상단 "🌟 내 조건 일치 5–10건" + 하단 마감일순 전체(매칭 항목에 ✨ 배지) |
| 프로필 저장 후 | 아무 변화 없음 | 자동 알림 규칙 1건 생성 ("내 조건과 일치하는 신규 정책 알림") |

---

## 3. 데이터 모델 변경

### 3-1. user_profiles 컬럼 확장 (마이그레이션 `038_user_profile_extended.sql`)

```sql
ALTER TABLE user_profiles
  ADD COLUMN income_level TEXT,        -- 'low' | 'mid_low' | 'mid' | 'mid_high' | 'high' | null
  ADD COLUMN household_types TEXT[],   -- ['single','married','single_parent','multi_child','disabled_family',...]
  ADD COLUMN benefit_tags TEXT[];      -- interests 9종을 BENEFIT_TAGS 14종으로 변환·저장 (캐시)

CREATE INDEX idx_user_profiles_benefit_tags ON user_profiles USING GIN (benefit_tags);
CREATE INDEX idx_user_profiles_household_types ON user_profiles USING GIN (household_types);
```

- `income_level`: 기준중위소득 비율 구간으로 단순화 (수치 입력 회피, 진입장벽 최소화)
- `household_types`: 다중 선택 (한부모이자 다자녀 가능)
- `benefit_tags`: interests 입력 시 trigger 로 자동 변환·저장 (조회 속도 보장)

### 3-2. interests↔BENEFIT_TAGS 매핑 (`lib/personalization/interest-mapping.ts`)

```ts
// 기존 interests 9종 → BENEFIT_TAGS 14종 매핑
export const INTEREST_TO_BENEFIT_TAGS: Record<string, string[]> = {
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

export function interestsToBenefitTags(interests: string[] | null): string[] {
  if (!interests?.length) return [];
  const set = new Set<string>();
  for (const it of interests) {
    for (const tag of INTEREST_TO_BENEFIT_TAGS[it] ?? []) {
      set.add(tag);
    }
  }
  return Array.from(set);
}
```

### 3-3. 자동 정규화 트리거 (`039_interest_to_benefit_trigger.sql`)

user_profiles INSERT/UPDATE 시 interests → benefit_tags 자동 채움. 031~035 통합 분류 마이그레이션의 정규화 트리거 패턴을 그대로 따른다.

### 3-4. 자동 알림 규칙 추적 컬럼 (`040_alert_rule_auto_flag.sql`)

```sql
ALTER TABLE user_alert_rules
  ADD COLUMN is_auto_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN auto_rule_disabled_at TIMESTAMPTZ;
```

### 3-5. 온보딩 dismiss 추적 (`041_profile_dismiss_tracking.sql`)

```sql
ALTER TABLE user_profiles
  ADD COLUMN dismissed_onboarding_at TIMESTAMPTZ;
```

### 3-6. 데이터 전제 조건 — 정책 테이블 매칭 한계

확인 결과 **welfare/loan 정책 테이블에 `income_max`, `household_target` 컬럼이 없다.** 즉 §4-2 표의 소득(+4)·가구상태(+3) 정확 매칭은 데이터가 없어 즉시 적용 불가능하다.

**대응: 2단계 접근**

- **Phase 1 (현재 spec 범위)**: 본문·제목 정규식 매칭으로 약한 가산점만 부여
  - 소득: 본문에 "기준중위소득", "차상위", "기초생활" 등 키워드 + user.income_level 이 'low'/'mid_low' → +2
  - 가구상태: 본문·제목에 "한부모", "다자녀", "신혼부부", "장애" 등 키워드 + user.household_types 일치 → 일치당 +2
  - 가중치는 §4-2 표보다 낮춰 데이터 부정확성 보완
- **Phase 1.5 (후속)**: collector 단계에서 정책 본문을 분석해 `income_target_level`, `household_target_tags` 컬럼을 채우는 마이그레이션·작업 (spec 별도 작성)

§4-2 의 시그널 표는 Phase 1 기준으로 다시 정리한다 (§4-2 참고).

---

## 4. 추천 엔진 — 공통 인프라 우선

### 4-1. 디렉터리 구조

```
lib/personalization/
  ├── interest-mapping.ts      # interests → BENEFIT_TAGS 변환
  ├── score.ts                 # 정책 1건의 사용자 적합도 점수 계산
  ├── filter.ts                # 점수 ≥ threshold 항목만 추리는 필터
  ├── load-profile.ts          # 로그인 사용자 프로필 + benefit_tags 조회 (React cache)
  └── types.ts                 # UserSignals, ScoredItem 타입 정의
```

### 4-2. 점수 계산 규칙 (`score.ts`) — Phase 1 기준

기존 `lib/recommend.ts` 의 `scoreProgram()` 을 일반화·확장한다. §3-6 의 데이터 전제 조건에 따라 소득·가구상태는 본문 정규식 매칭으로 약한 가산점만 부여한다.

| 시그널 | 가중치 | 매칭 방법 | 데이터 출처 |
|---|---|---|---|
| 지역 일치 (광역) | +5 | program.region ⊃ user.region | 기존 컬럼 |
| 지역 일치 (시군구) | +5 추가 | program.district 매칭 | 기존 컬럼 |
| BENEFIT_TAGS 교집합 | +3 × 일치 태그 수 | 배열 overlap | 기존 컬럼 (031~035 분류 통일) |
| 직업 키워드 | +2 | OCCUPATION_KEYWORDS (기존) | 본문 정규식 |
| 나이대 키워드 | +1 | AGE_KEYWORDS (기존) | 본문 정규식 |
| 소득 키워드 매칭 | +2 | "기준중위소득"·"차상위"·"기초생활" 키워드 + user.income_level 이 'low'/'mid_low' | 본문 정규식 (Phase 1.5 에 컬럼화) |
| 가구상태 키워드 매칭 | +2 × 일치 수 | "한부모"·"다자녀"·"신혼부부"·"장애" 등 + user.household_types 일치 | 본문 정규식 (Phase 1.5 에 컬럼화) |
| 마감 임박 (D-7 이내) | +1 (tiebreaker) | 같은 점수일 때 우선 | 기존 컬럼 |

총점 0–20점 분포 예상. **점수 ≥ 5점이면 "내 조건 일치"** 로 간주, 상위 5–10건 분리 섹션 노출.

### 4-3. 캐싱

`load-profile.ts` 는 React `cache()` 로 요청당 한 번만 DB 조회. 한 SSR 안에서 `PersonalizedSection` + `MatchBadge` 등 5–10번 호출돼도 부담 0.

### 4-4. 비로그인 사용자 처리

profile 없음 → score 함수가 빈 배열 반환 → "맞춤 섹션" 자체가 렌더링되지 않음. 기존 정렬·필터만 노출 (회귀 0).

---

## 5. 온보딩 UI

### 5-1. 흐름

가입 → 이메일 인증 → 첫 로그인 → **`/onboarding` 자동 redirect** → 5단계 → `/mypage`

```
Step 1/5  나이대를 골라주세요         [건너뛰기]
Step 2/5  거주 지역은요?              [건너뛰기]
Step 3/5  현재 직업·상황은요?         [건너뛰기]
Step 4/5  소득 수준 (선택)            [건너뛰기]
Step 5/5  관심 있는 분야 (다중선택)   [완료]
```

### 5-2. 핵심 UX 결정

- 각 단계마다 **"건너뛰기"** = 빈 값 저장 후 다음 단계
- 마지막 "완료" 클릭 → user_profiles upsert + 자동 알림 규칙 1건 생성 (§7)
- `?onboarding=1` query 또는 dismiss timestamp 기반 재팝업 방지
- 마이페이지에 "온보딩 다시 하기" 버튼 (재진입 가능)

### 5-3. 컴포넌트 구조

```
app/onboarding/
  ├── page.tsx                 # /onboarding 라우트 (풀페이지)
  ├── onboarding-flow.tsx      # client component, useState 로 step 관리
  └── steps/
      ├── step-age.tsx
      ├── step-region.tsx
      ├── step-occupation.tsx
      ├── step-income.tsx
      └── step-interests.tsx
```

**모달이 아닌 풀페이지**: 모바일에서 답답하지 않고, 가입 직후 redirect 가 자연스럽고, 구현·테스트 단순.

### 5-4. 진행률 표시

상단에 `[●●○○○] 2/5` 진행 바. 각 단계 30초 이내 완료 목표.

---

## 6. welfare 페이지 통합 — 분리 섹션 + 전체

### 6-1. 페이지 구조 변경 (`app/welfare/page.tsx`)

```tsx
// 의사코드
const userProfile = await loadUserProfile();           // 비로그인이면 null
const allPrograms = await fetchWelfarePrograms(...);   // 기존 로직 그대로

const personalSection = userProfile
  ? scoreAndFilter(allPrograms, userProfile, { minScore: 5, limit: 10 })
  : [];

return (
  <>
    <CategoryChipBar ... />
    {personalSection.length > 0 && (
      <PersonalizedSection
        items={personalSection}
        userName={userProfile.display_name}
      />
    )}
    {userProfile && personalSection.length === 0 && profileIsEmpty(userProfile) && (
      <EmptyProfilePrompt href="/onboarding" />
    )}
    <FullList items={allPrograms} highlightIds={personalSection.map(i => i.id)} />
  </>
);
```

### 6-2. 신규 공통 컴포넌트

```
components/personalization/
  ├── PersonalizedSection.tsx  # "🌟 ○○님께 맞는 정책" 헤더 + 카드 그리드
  ├── EmptyProfilePrompt.tsx   # "프로필을 채우면 맞춤 정책을 보여드려요"
  └── MatchBadge.tsx           # 전체 리스트에서 매칭 항목 ✨ 배지
```

### 6-3. 사용자별 시나리오 처리

| 상태 | 분리 섹션 | 전체 리스트 |
|---|---|---|
| 비로그인 | 안 보임 | 기존 그대로 |
| 로그인 + 프로필 비어있음 | `EmptyProfilePrompt` 표시 | 기존 그대로 |
| 로그인 + 프로필 일부만 | 매칭 결과 있으면 표시, 0건이면 안 보임 | 매칭 항목 ✨ |
| 로그인 + 프로필 완전 | 5–10건 표시 | 매칭 항목 ✨ |

### 6-4. 카테고리·검색 필터와의 동작

분리 섹션은 페이지 단위 필터(카테고리/지역/검색)를 **그대로 따른다**. 즉 사용자가 "주거" 카테고리 클릭하면 분리 섹션도 주거 정책 중에서 매칭. 별도 토글 없음 (단순).

---

## 7. 자동 알림 규칙

### 7-1. 트리거 시점

- 온보딩 5단계 "완료" 클릭 시
- 마이페이지에서 프로필 업데이트 시 (이미 자동 규칙 있으면 갱신)

### 7-2. 자동 생성 규칙

```sql
INSERT INTO user_alert_rules (
  user_id, name,
  region_tags, age_tags, occupation_tags, benefit_tags, household_tags,
  channels, is_auto_generated, is_active
) VALUES (
  <user>, '내 조건 맞춤 알림',
  ARRAY[user.region], ARRAY[user.age_group], ARRAY[user.occupation],
  user.benefit_tags, user.household_types,
  CASE WHEN tier = 'pro' THEN ARRAY['email','kakao'] ELSE ARRAY['email'] END,
  TRUE, TRUE
);
```

### 7-3. 마이페이지 노출

"자동으로 만든 규칙" 배지 + "수정/끄기" 버튼. 사용자가 직접 끄면 `auto_rule_disabled_at` 기록 후 다시 자동 생성하지 않음.

### 7-4. 빈 프로필 가드

모든 항목이 빈 값이면 자동 규칙 생성 건너뜀 (전체 정책에 매칭돼 스팸 됨).

---

## 8. 홈 추천 카드 강화

기존 `HomeRecommendCard` 를 사용자 상태에 따라 분기 노출.

| 상태 | 노출 |
|---|---|
| 비로그인 | 기존 입력 유도 카드 (그대로) |
| 로그인 + 프로필 비어있음 | "프로필 채우기" CTA 카드 (`/onboarding` 링크) |
| 로그인 + 프로필 채워짐 | 🌟 자동 추천 5건 카드 + "전체 보기 → /welfare" 링크 |

같은 `PersonalizedSection` 컴포넌트 재사용, `limit=5` 로 호출.

---

## 9. 확장 계획 (welfare 이후)

| 순서 | 영역 | welfare 와 다른 점 | 추가 작업 |
|---|---|---|---|
| 1 | **welfare** (선행) | — | 공통 인프라 + welfare 통합 |
| 2 | **loan** | 지역이 본문에 prefix 형태 (`[서울]…`) | 정규식 추출 함수 추가, 나머지 동일 |
| 3 | **news** | 이미 benefit_tags 사용 중 | `PersonalizedSection` 만 끼워넣기 (가장 빠름) |
| 4 | **blog** | 카테고리 매칭만 | `interest_tags` ↔ blog `category` 매핑 추가 |

각 영역 확장 시 **재사용**: `lib/personalization/*` 전체, 모든 공통 컴포넌트.
**영역별 신규 코드**: 페이지 SSR 한 줄 + 영역별 가중치 미세 조정 정도.

### 일정 가이드

- Phase 1 (공통 인프라 + welfare): 1–2주
- loan 확장: 2–3일
- news 확장: 1–2일
- blog 확장: 1–2일

각 phase 끝에 master 직접 푸시·배포·관찰. 회귀 발견되면 다음 phase 보류.

---

## 10. 개인정보·법적 고려

### 10-1. 개인정보 처리방침 업데이트

- 신규 수집 항목: 소득 수준, 가구 상태
- 수집 목적: "맞춤형 정책 추천 제공"
- 보관 기간: 회원 탈퇴 시까지
- 제3자 제공: 없음

### 10-2. 동의 흐름

- 온보딩 4단계(소득)·5단계(관심사) 화면 상단에 안내 문구: "이 정보는 맞춤 추천에만 사용되며 외부에 제공되지 않습니다"
- 별도 동의 체크박스는 만들지 않음. 정보 입력 자체가 동의로 해석되는 영역, 단 처리방침 명시 필수
- 가구상태(장애가구/한부모 등) 는 민감정보로 분류 → 입력 단계에서 명시 + 기존 `agreements.sensitive_topics` 동의 여부 확인

### 10-3. 데이터 삭제권

- 마이페이지 "프로필 항목별 비우기" 버튼 (전체 탈퇴 외에도 부분 삭제 보장)
- 회원 탈퇴 시 user_profiles 캐스케이드 삭제 (기존 RLS 정책 그대로)

---

## 11. 테스트 전략

### 11-1. 단위 테스트 (`__tests__/personalization/`)

- `score.test.ts`: 시나리오별 점수 계산 (지역만, 직업만, 모든 신호, 빈 프로필)
- `interest-mapping.test.ts`: 9개 interests 모두 BENEFIT_TAGS 변환 누락 없는지
- `filter.test.ts`: minScore threshold, 정렬 안정성

### 11-2. 통합 시나리오 (수동 QA)

- 신규 가입 → 온보딩 5단계 모두 입력 → welfare 분리 섹션 보이는지
- 신규 가입 → 온보딩 모두 건너뛰기 → welfare 가 기존과 동일한지
- 비로그인 welfare 방문 → 분리 섹션 안 보이는지
- 프로필 일부만 (지역만) → 지역 가산점만 적용된 결과 보이는지
- 자동 알림 규칙 생성 후 cron 발송 → 본인 조건에 맞는 정책만 도착하는지

### 11-3. 회귀 보호

- welfare 비로그인 SSR 결과 변경 전과 동일 (snapshot)
- /admin/users/[userId] 가 새 컬럼(income_level, household_types) 표시하는지

### 11-4. 성능 검증

- `load-profile.ts` 의 React `cache()` 가 페이지당 1회만 DB 조회 (Supabase 로그)
- 분리 섹션 점수 계산 50건 정책 기준 50ms 이내

---

## 12. 마이그레이션 번호 예약

| 번호 | 내용 |
|---|---|
| `038_user_profile_extended.sql` | income_level, household_types, benefit_tags 컬럼 |
| `039_interest_to_benefit_trigger.sql` | interests → benefit_tags 자동 변환 트리거 |
| `040_alert_rule_auto_flag.sql` | user_alert_rules.is_auto_generated, auto_rule_disabled_at |
| `041_profile_dismiss_tracking.sql` | user_profiles.dismissed_onboarding_at |

---

## 13. 결정 로그 (사장님 답변 기록)

| 결정 | 사장님 답변 |
|---|---|
| 우선순위 | 4가지(피드 동일·홈 추천 부재·온보딩 부재·interests 무용지물) 모두 해결 |
| 프로필 확장 범위 | 소득 + 가구상태 모두 추가 |
| 온보딩 흐름 | 단계형 5단계 + 건너뛰기 허용 |
| 피드 UI | "분리 섹션 + 전체" (상단 맞춤 + 하단 마감일순 전체) |
| 구현 전략 | B 옵션 (수직 슬라이스, welfare 부터) |
