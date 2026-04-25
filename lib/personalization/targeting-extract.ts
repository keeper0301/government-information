// lib/personalization/targeting-extract.ts
// Phase 1.5: 정책 본문 키워드 분석으로 income/household target 추출
// LLM 미사용 (Gemini 폐기됨), 정규식 사전만 사용.
// 우선순위 — low > mid_low > mid > any (가장 좁은 범위 우선).

// 소득 수준 타입: low=기초수급, mid_low=차상위, mid=중위소득100~150%, any=전 국민
export type IncomeTargetLevel = 'low' | 'mid_low' | 'mid' | 'any';

// 가구 유형 태그: 한부모·다자녀·신혼·장애·노인·1인
export type HouseholdTargetTag =
  | 'single_parent'
  | 'multi_child'
  | 'married'
  | 'disabled_family'
  | 'elderly_family'
  | 'single';

// 소득 수준별 키워드 정규식 사전 (우선순위 높은 순)
const INCOME_KEYWORDS: Record<Exclude<IncomeTargetLevel, 'any'>, RegExp[]> = {
  // 가장 좁은 범위: 기초생활수급·의료급여 등
  low: [
    /기초생활/,
    /수급권자/,
    /긴급복지/,
    /의료급여/,
    /생계급여/,
    /주거급여/,
  ],
  // 중간 좁은 범위: 차상위 또는 중위소득 60~80%
  mid_low: [
    /차상위/,
    /기준중위소득\s*(60|70|80)\s*%/,
    /중위소득\s*(60|70|80)\s*%/,
  ],
  // 중간 범위: 중위소득 100~150%
  mid: [
    /기준중위소득\s*(100|120|150)\s*%/,
    /중위소득\s*(100|120|150)\s*%/,
  ],
};

// 소득 무관 (가장 넓은 범위) 키워드
const ANY_INCOME_KEYWORDS: RegExp[] = [
  /전\s*국민/,
  /모든\s*국민/,
  /제한\s*없음/,
  /소득\s*무관/,
];

// 가구 유형별 키워드 정규식 사전
const HOUSEHOLD_KEYWORDS: Record<HouseholdTargetTag, RegExp[]> = {
  // 한부모 가정
  single_parent: [/한부모/, /한부모가족/, /한부모가정/],
  // 다자녀 가구 (3자녀 이상 포함)
  multi_child: [/다자녀/, /3자녀\s*이상/, /셋째/, /3명\s*이상\s*자녀/],
  // 신혼부부
  married: [/신혼부부/, /신혼/],
  // 장애인 가구
  disabled_family: [/장애인/, /장애아동/, /장애아\s*가구/, /중증장애/],
  // 고령·노인 가구
  elderly_family: [/독거노인/, /고령가구/, /경로/, /노인\s*가구/, /만\s*65세\s*이상/],
  // 1인 가구·독거 (독거노인은 elderly_family 에서 처리하므로 제외)
  single: [/1인가구/, /1\s*인가구/, /독거(?!노인)/],
};

// 정책 본문에서 소득 수준과 가구 유형을 추출하는 함수
// haystack: 분석할 정책 본문 문자열
export function extractTargeting(haystack: string): {
  income_target_level: IncomeTargetLevel | null;
  household_target_tags: HouseholdTargetTag[];
} {
  // 소득 수준 — 우선순위 순 매칭, 첫 매칭만 사용 (low > mid_low > mid)
  let income: IncomeTargetLevel | null = null;
  for (const level of ['low', 'mid_low', 'mid'] as const) {
    if (INCOME_KEYWORDS[level].some((re) => re.test(haystack))) {
      income = level;
      break;
    }
  }
  // 위 3단계에 해당 없고, 전 국민 키워드 있으면 any
  if (income === null && ANY_INCOME_KEYWORDS.some((re) => re.test(haystack))) {
    income = 'any';
  }

  // 가구 유형 — 모든 매칭 수집 (중복 가능)
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
