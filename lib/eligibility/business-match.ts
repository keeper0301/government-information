// lib/eligibility/business-match.ts
// 자영업자/소상공인 자격 진단 — Basic 핵심 wedge.
//
// 정책 본문에서 자격 요구사항(매출·직원·업종·사업자유형·창업N년차) 을 정규식으로
// 추출 → 사용자 business_profile 과 매칭 → 'match' / 'mismatch' / 'unknown'.
//
// score.ts business 시그널 + /welfare /loan 카드 ✓/✗ 배지 + 카톡 알림 v3
// eligibility_status 변수 모두 이 함수 결과 공유.
//
// 보수적 설계: 자격 요구사항 추출 0 또는 사용자 정보 0 → 'unknown'.
// 'mismatch' 는 명백한 자격 미달 (정책 상한 초과) 만. 잘못된 mismatch 로
// 정책 가리는 위험 최소화.

import type {
  BusinessIndustry,
  BusinessRevenue,
  BusinessEmployee,
  BusinessType,
} from '@/lib/profile-options';

// ============================================================
// 타입
// ============================================================
export type BusinessProfile = {
  industry: BusinessIndustry | null;
  revenue_scale: BusinessRevenue | null;
  employee_count: BusinessEmployee | null;
  business_type: BusinessType | null;
  established_date: string | null; // ISO date YYYY-MM-DD
  region: string | null;
  district: string | null;
};

export type BusinessMatch = 'match' | 'mismatch' | 'unknown';

// 정책 본문에서 추출한 자격 요구사항. 미추출 필드는 undefined.
export type PolicyRequirement = {
  // 매출 상한 (이하 자격) — 단위: 원
  max_revenue?: number;
  // 직원 수 상한 (이하 자격)
  max_employees?: number;
  // 업종 화이트리스트 (해당 업종만 자격)
  industries?: BusinessIndustry[];
  // 사업자 유형 화이트리스트
  business_types?: BusinessType[];
  // 창업 N년차 상한 (이하 자격)
  max_years_since_established?: number;
};

// ============================================================
// 정책 본문 → PolicyRequirement 추출
// ============================================================

// 업종별 키워드 정규식 사전
const INDUSTRY_KEYWORDS: Record<BusinessIndustry, RegExp[]> = {
  food: [/외식/, /요식/, /음식점/, /식당/, /카페/, /주점/],
  retail: [/소매/, /도소매/, /도매/, /유통업/],
  manufacturing: [/제조업/, /제조공정/, /생산업체/],
  service: [/서비스업/],
  it: [/IT\s*기업/, /정보통신/, /콘텐츠/, /소프트웨어/, /벤처기업/],
  // 'other' 는 키워드 매칭으로 추출하지 않음 (의미 없는 분류)
  other: [],
};

export function extractPolicyRequirements(text: string): PolicyRequirement {
  const result: PolicyRequirement = {};

  // 매출 상한 — "매출 5억 이하" / "연매출 10억원 이하" / "매출액 5천만원 이하"
  const revenueMatch = text.match(
    /(?:매출|매출액|연매출)[\s가-힣]*?(\d+)\s*(억|천만)\s*(?:원\s*)?(?:이하|미만)/,
  );
  if (revenueMatch) {
    const num = parseInt(revenueMatch[1], 10);
    const unit = revenueMatch[2];
    if (unit === '억') result.max_revenue = num * 100_000_000;
    else if (unit === '천만') result.max_revenue = num * 10_000_000;
  }

  // 직원 수 상한 — "상시근로자 5인 미만" / "근로자 10명 이하" / "직원 30인 이하"
  const employeeMatch = text.match(
    /(?:상시근로자|근로자|직원|종업원)\s*(\d+)\s*(?:인|명)\s*(?:미만|이하)/,
  );
  if (employeeMatch) {
    result.max_employees = parseInt(employeeMatch[1], 10);
  }

  // 소상공인 법적 정의 자동 적용 (소상공인기본법): 매출 5억 + 5인 이하
  // 단 매출/직원 명시가 우선
  if (/소상공인/.test(text)) {
    if (result.max_revenue === undefined) result.max_revenue = 500_000_000;
    if (result.max_employees === undefined) result.max_employees = 5;
  }

  // 업종 — INDUSTRY_KEYWORDS 매칭
  const matchedIndustries: BusinessIndustry[] = [];
  for (const [key, patterns] of Object.entries(INDUSTRY_KEYWORDS) as [
    BusinessIndustry,
    RegExp[],
  ][]) {
    if (patterns.length > 0 && patterns.some((re) => re.test(text))) {
      matchedIndustries.push(key);
    }
  }
  if (matchedIndustries.length > 0) {
    result.industries = matchedIndustries;
  }

  // 사업자 유형 — 정확히 한 쪽만 명시된 경우만 (양쪽 다 언급되면 매칭 안 함)
  const hasIndividual = /개인\s*사업자/.test(text);
  const hasCorporation = /법인\s*(?:사업자|기업)/.test(text);
  if (hasIndividual && !hasCorporation) {
    result.business_types = ['sole_proprietor'];
  } else if (hasCorporation && !hasIndividual) {
    result.business_types = ['corporation'];
  }

  // 창업 N년차 — "창업 3년 이내" / "설립 5년 이내 기업"
  const yearsMatch = text.match(/(?:창업|설립)\s*(\d+)\s*년\s*이[내하]/);
  if (yearsMatch) {
    result.max_years_since_established = parseInt(yearsMatch[1], 10);
  }

  return result;
}

// ============================================================
// 사용자 enum → 매출/직원 추정값
// ============================================================
// 사용자가 enum 으로 입력한 매출/직원 범위에서 mismatch 판정용 경계값.
// 매출은 enum 의 "상한" — 사용자가 이 enum 인 경우 매출이 이 값을 넘지 않음.
// 직원은 enum 의 "하한" — 사용자가 이 enum 인 경우 직원이 최소 이 값.

const REVENUE_UPPER_BOUND: Record<BusinessRevenue, number> = {
  under_50m: 50_000_000,
  '50m_500m': 500_000_000,
  '500m_1b': 1_000_000_000,
  '1b_10b': 10_000_000_000,
  over_10b: Number.POSITIVE_INFINITY,
};

const EMPLOYEE_LOWER_BOUND: Record<BusinessEmployee, number> = {
  none: 0,
  '1_4': 1,
  '5_9': 5,
  '10_49': 10,
  '50_99': 50,
  over_100: 100,
};

// ============================================================
// 매칭 함수
// ============================================================
//   match     : 모든 명시 요구사항을 사용자 정보가 만족
//   mismatch  : 명시 요구사항 중 하나라도 명백히 미달 (정책 상한 초과)
//   unknown   : 요구사항 미추출 또는 사용자 정보 누락 — 잘못된 가림 방지
//
// 보수적 룰: mismatch 는 정확히 검증 가능한 경우만. 사용자 정보 없으면 unknown.

export function matchBusinessProfile(
  profile: BusinessProfile,
  requirements: PolicyRequirement,
): BusinessMatch {
  const hasAnyRequirement =
    requirements.max_revenue !== undefined ||
    requirements.max_employees !== undefined ||
    (requirements.industries && requirements.industries.length > 0) ||
    (requirements.business_types && requirements.business_types.length > 0) ||
    requirements.max_years_since_established !== undefined;

  // 정책에 자격 요구사항이 하나도 없으면 자격 무관 정책 → unknown 처리
  // (전 사용자 대상이라 mismatch 도 match 도 아님)
  if (!hasAnyRequirement) return 'unknown';

  let matchedAtLeastOne = false;

  // 매출 상한 검사
  if (requirements.max_revenue !== undefined) {
    if (!profile.revenue_scale) return 'unknown';
    const userMaxRevenue = REVENUE_UPPER_BOUND[profile.revenue_scale];
    // 사용자 enum 의 상한이 정책 상한 초과면 명백히 mismatch
    // (예: 정책 5억 이하 + 사용자 5억~10억 → mismatch)
    if (userMaxRevenue > requirements.max_revenue) return 'mismatch';
    matchedAtLeastOne = true;
  }

  // 직원수 상한 검사
  if (requirements.max_employees !== undefined) {
    if (!profile.employee_count) return 'unknown';
    const userMinEmployees = EMPLOYEE_LOWER_BOUND[profile.employee_count];
    // 사용자 enum 의 하한이 정책 상한 초과면 명백히 mismatch
    if (userMinEmployees > requirements.max_employees) return 'mismatch';
    matchedAtLeastOne = true;
  }

  // 업종 검사 — 화이트리스트
  if (requirements.industries && requirements.industries.length > 0) {
    if (!profile.industry) return 'unknown';
    if (!requirements.industries.includes(profile.industry)) return 'mismatch';
    matchedAtLeastOne = true;
  }

  // 사업자 유형 검사
  if (requirements.business_types && requirements.business_types.length > 0) {
    if (!profile.business_type) return 'unknown';
    if (!requirements.business_types.includes(profile.business_type)) {
      return 'mismatch';
    }
    matchedAtLeastOne = true;
  }

  // 창업 N년차 검사
  if (requirements.max_years_since_established !== undefined) {
    if (!profile.established_date) return 'unknown';
    const established = new Date(profile.established_date);
    if (Number.isNaN(established.getTime())) return 'unknown';
    const yearsSince =
      (Date.now() - established.getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    if (yearsSince > requirements.max_years_since_established) {
      return 'mismatch';
    }
    matchedAtLeastOne = true;
  }

  return matchedAtLeastOne ? 'match' : 'unknown';
}

// 한 번에: 정책 본문 → 사용자 매칭 결과
export function evaluateBusinessMatch(
  policyText: string,
  profile: BusinessProfile,
): BusinessMatch {
  const requirements = extractPolicyRequirements(policyText);
  return matchBusinessProfile(profile, requirements);
}
