import { describe, it, expect } from 'vitest';
import {
  extractPolicyRequirements,
  matchBusinessProfile,
  evaluateBusinessMatch,
  type BusinessProfile,
} from '@/lib/eligibility/business-match';

// ============================================================
// extractPolicyRequirements — 정책 본문에서 자격 요구사항 추출
// ============================================================
describe('extractPolicyRequirements', () => {
  it('빈 문자열 → 빈 객체', () => {
    expect(extractPolicyRequirements('')).toEqual({});
  });

  it('"매출 5억 이하" → max_revenue 5억', () => {
    expect(extractPolicyRequirements('매출 5억 이하 사업자').max_revenue).toBe(
      500_000_000,
    );
  });

  it('"연매출 10억원 이하" → max_revenue 10억', () => {
    expect(extractPolicyRequirements('연매출 10억원 이하').max_revenue).toBe(
      1_000_000_000,
    );
  });

  it('"매출액 5천만원 미만" → max_revenue 5천만', () => {
    expect(extractPolicyRequirements('매출액 5천만원 미만').max_revenue).toBe(
      50_000_000,
    );
  });

  it('"상시근로자 5인 미만" → max_employees 5', () => {
    expect(
      extractPolicyRequirements('상시근로자 5인 미만 사업장').max_employees,
    ).toBe(5);
  });

  it('"근로자 30명 이하" → max_employees 30', () => {
    expect(extractPolicyRequirements('근로자 30명 이하').max_employees).toBe(30);
  });

  it('"소상공인" 키워드 → 매출 5억 + 직원 5 자동 적용', () => {
    const r = extractPolicyRequirements('소상공인 대상 정책자금');
    expect(r.max_revenue).toBe(500_000_000);
    expect(r.max_employees).toBe(5);
  });

  it('"소상공인" + 매출 명시 → 매출은 명시값 우선', () => {
    const r = extractPolicyRequirements('소상공인 중 매출 3억 이하');
    expect(r.max_revenue).toBe(300_000_000);
    expect(r.max_employees).toBe(5);
  });

  it('"외식업" → industries food', () => {
    expect(extractPolicyRequirements('외식 업체 대상').industries).toContain(
      'food',
    );
  });

  it('"제조업" → industries manufacturing', () => {
    expect(
      extractPolicyRequirements('제조업 사업자').industries,
    ).toContain('manufacturing');
  });

  it('"개인 사업자" 만 → business_types sole_proprietor', () => {
    expect(
      extractPolicyRequirements('개인 사업자 대상').business_types,
    ).toEqual(['sole_proprietor']);
  });

  it('"법인 기업" 만 → business_types corporation', () => {
    expect(
      extractPolicyRequirements('법인 기업 대상').business_types,
    ).toEqual(['corporation']);
  });

  it('개인 + 법인 둘 다 명시 → business_types 미설정 (모호)', () => {
    expect(
      extractPolicyRequirements('개인 사업자·법인 기업 모두 가능').business_types,
    ).toBeUndefined();
  });

  it('"창업 3년 이내" → max_years_since_established 3', () => {
    expect(
      extractPolicyRequirements('창업 3년 이내 기업')
        .max_years_since_established,
    ).toBe(3);
  });

  it('"설립 5년 이하" → max_years_since_established 5', () => {
    expect(
      extractPolicyRequirements('설립 5년 이하 기업')
        .max_years_since_established,
    ).toBe(5);
  });

  // ========================================================
  // 2026-05-31 확장 — INDUSTRY_KEYWORDS / 매출 / 직원 / 창업 신규 패턴
  // ========================================================
  describe('확장 키워드 + regex (2026-05-31)', () => {
    it('"베이커리 운영자" → industries food (신규)', () => {
      expect(
        extractPolicyRequirements('베이커리 운영자 대상').industries,
      ).toContain('food');
    });

    it('"편의점 점주" → industries retail (신규)', () => {
      expect(
        extractPolicyRequirements('편의점 점주 대상').industries,
      ).toContain('retail');
    });

    it('"스타트업 대상" → industries it (신규)', () => {
      expect(
        extractPolicyRequirements('스타트업 대상').industries,
      ).toContain('it');
    });

    it('"미용업 종사자" → industries service (신규)', () => {
      expect(
        extractPolicyRequirements('미용업 종사자').industries,
      ).toContain('service');
    });

    it('"월매출 5억 이하" → max_revenue 5억 (신규 키워드)', () => {
      expect(
        extractPolicyRequirements('월매출 5억 이하 사업자').max_revenue,
      ).toBe(500_000_000);
    });

    it('"매출 3억 이내" → max_revenue 3억 (신규 종결어 "이내")', () => {
      expect(
        extractPolicyRequirements('매출 3억 이내 사업자').max_revenue,
      ).toBe(300_000_000);
    });

    it('"직원 5명 이내" → max_employees 5 (신규 종결어 "이내")', () => {
      expect(
        extractPolicyRequirements('직원 5명 이내 사업장').max_employees,
      ).toBe(5);
    });

    it('"10인 이하 사업장" → max_employees 10 (무키워드 변형)', () => {
      expect(
        extractPolicyRequirements('10인 이하 사업장 대상').max_employees,
      ).toBe(10);
    });

    it('"개업 3년 이내" → max_years_since_established 3 (신규 키워드)', () => {
      expect(
        extractPolicyRequirements('개업 3년 이내 사업자')
          .max_years_since_established,
      ).toBe(3);
    });

    it('"창업 후 5년 이내" → max_years_since_established 5 (신규 "후")', () => {
      expect(
        extractPolicyRequirements('창업 후 5년 이내 기업')
          .max_years_since_established,
      ).toBe(5);
    });

    it('"설립 3년 미만" → max_years_since_established 3 (신규 "미만")', () => {
      expect(
        extractPolicyRequirements('설립 3년 미만 기업')
          .max_years_since_established,
      ).toBe(3);
    });
  });

  // ========================================================
  // 2026-05-31 BUSINESS_POLICY_SIGNAL 확장 (evaluateBusinessMatch 경유)
  // ========================================================
  describe('BUSINESS_POLICY_SIGNAL 신규 키워드 (evaluateBusinessMatch)', () => {
    const PROFILE_FOOD_SMALL: BusinessProfile = {
      industry: 'food',
      revenue_scale: 'under_50m',
      employee_count: '1_4',
      business_type: 'sole_proprietor',
      established_date: '2023-01-01',
      region: '전남',
      district: '순천시',
    };

    it('"자영자" 시그널 → 사업자 정책 인식 (signal 통과)', () => {
      // 자영자 시그널 + food 키워드 → industries food 매칭
      const result = evaluateBusinessMatch(
        '자영자 외식업 대상 지원',
        PROFILE_FOOD_SMALL,
      );
      expect(result).toBe('match');
    });

    it('"영세사업자" 시그널 → 사업자 정책 인식', () => {
      const result = evaluateBusinessMatch(
        '영세사업자 음식점 대상',
        PROFILE_FOOD_SMALL,
      );
      expect(result).toBe('match');
    });

    it('"1인사업자" 시그널 → 사업자 정책 인식', () => {
      const result = evaluateBusinessMatch(
        '1인사업자 외식 지원',
        PROFILE_FOOD_SMALL,
      );
      expect(result).toBe('match');
    });

    it('일반 복지 본문 (자영자 시그널 없음) → unknown 유지 (false positive 0)', () => {
      // 일반 복지 본문에 매출 키워드 우연 등장 — 사업자 시그널 없으면 unknown
      const result = evaluateBusinessMatch(
        '기초수급자 매출 5억 이하 대상',
        PROFILE_FOOD_SMALL,
      );
      expect(result).toBe('unknown');
    });
  });
});

// ============================================================
// matchBusinessProfile — 요구사항 + 프로필 → match/mismatch/unknown
// ============================================================
const EMPTY_PROFILE: BusinessProfile = {
  industry: null,
  revenue_scale: null,
  employee_count: null,
  business_type: null,
  established_date: null,
  region: null,
  district: null,
};

describe('matchBusinessProfile', () => {
  it('요구사항 0 + 프로필 0 → unknown', () => {
    expect(matchBusinessProfile(EMPTY_PROFILE, {})).toBe('unknown');
  });

  it('요구사항 매출 5억 + 프로필 5천만~5억 → match', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, revenue_scale: '50m_500m' },
        { max_revenue: 500_000_000 },
      ),
    ).toBe('match');
  });

  it('요구사항 매출 5억 + 프로필 5억~10억 → mismatch', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, revenue_scale: '500m_1b' },
        { max_revenue: 500_000_000 },
      ),
    ).toBe('mismatch');
  });

  it('요구사항 매출 5억 + 프로필 0 → unknown', () => {
    expect(
      matchBusinessProfile(EMPTY_PROFILE, { max_revenue: 500_000_000 }),
    ).toBe('unknown');
  });

  it('요구사항 직원 5명 + 프로필 1~4 → match', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, employee_count: '1_4' },
        { max_employees: 5 },
      ),
    ).toBe('match');
  });

  it('요구사항 직원 5명 + 프로필 10~49 → mismatch', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, employee_count: '10_49' },
        { max_employees: 5 },
      ),
    ).toBe('mismatch');
  });

  it('요구사항 업종 food + 프로필 food → match', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, industry: 'food' },
        { industries: ['food'] },
      ),
    ).toBe('match');
  });

  it('요구사항 업종 food + 프로필 retail → mismatch', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, industry: 'retail' },
        { industries: ['food'] },
      ),
    ).toBe('mismatch');
  });

  it('요구사항 사업자 corp + 프로필 sole → mismatch', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, business_type: 'sole_proprietor' },
        { business_types: ['corporation'] },
      ),
    ).toBe('mismatch');
  });

  it('요구사항 창업 3년 이내 + 프로필 1년차 (2025-01-01 설립) → match', () => {
    // 기준일 2026-04-26 — 1년 4개월차
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, established_date: '2025-01-01' },
        { max_years_since_established: 3 },
      ),
    ).toBe('match');
  });

  it('요구사항 창업 3년 이내 + 프로필 10년차 (2015-01-01 설립) → mismatch', () => {
    expect(
      matchBusinessProfile(
        { ...EMPTY_PROFILE, established_date: '2015-01-01' },
        { max_years_since_established: 3 },
      ),
    ).toBe('mismatch');
  });

  it('복합 매칭: 매출 + 직원 모두 만족 → match', () => {
    expect(
      matchBusinessProfile(
        {
          ...EMPTY_PROFILE,
          revenue_scale: '50m_500m',
          employee_count: '1_4',
        },
        { max_revenue: 500_000_000, max_employees: 5 },
      ),
    ).toBe('match');
  });

  it('복합 매칭: 매출 OK + 직원 초과 → mismatch (한 조건만 미달이어도)', () => {
    expect(
      matchBusinessProfile(
        {
          ...EMPTY_PROFILE,
          revenue_scale: '50m_500m',
          employee_count: '10_49',
        },
        { max_revenue: 500_000_000, max_employees: 5 },
      ),
    ).toBe('mismatch');
  });
});

// ============================================================
// evaluateBusinessMatch — extract + match 통합
// ============================================================
describe('evaluateBusinessMatch', () => {
  it('소상공인 정책 + 5인 사장님 → match', () => {
    expect(
      evaluateBusinessMatch('소상공인 대상 정책자금 안내', {
        ...EMPTY_PROFILE,
        revenue_scale: '50m_500m',
        employee_count: '1_4',
      }),
    ).toBe('match');
  });

  it('소상공인 정책 + 100인 기업 → mismatch (직원 초과)', () => {
    expect(
      evaluateBusinessMatch('소상공인 대상 정책자금', {
        ...EMPTY_PROFILE,
        revenue_scale: '50m_500m',
        employee_count: 'over_100',
      }),
    ).toBe('mismatch');
  });

  it('자격 무관 일반 정책 + 사장님 정보 → unknown', () => {
    expect(
      evaluateBusinessMatch('전 국민 누구나 신청 가능한 지원금', {
        ...EMPTY_PROFILE,
        revenue_scale: '50m_500m',
      }),
    ).toBe('unknown');
  });

  // 2026-05-06: 일반 복지 정책에 우연히 매출/직원 키워드가 등장해도
  // 사업자 시그널 (소상공인/창업/사업자/기업/벤처/자영업 등) 없으면 unknown.
  // 이전에는 매출 키워드만으로 mismatch 판정 → 자영업 사용자가 일반 복지 정책에서
  // 차단되는 false positive 가 발생 (loan 53건 차단, 진단 도구 측정).
  it('일반 복지 정책에 매출 키워드만 있어도 사업자 시그널 없으면 unknown', () => {
    expect(
      evaluateBusinessMatch(
        '저소득 가구 지원금 — 가구 매출 5천만원 이하 대상',
        {
          ...EMPTY_PROFILE,
          revenue_scale: '500m_1b', // 5-10억 사장님
        },
      ),
    ).toBe('unknown');
  });

  it('일반 정책에 직원 키워드만 있어도 사업자 시그널 없으면 unknown', () => {
    expect(
      evaluateBusinessMatch(
        '한부모 가정 지원 — 가구원 5인 이하',
        {
          ...EMPTY_PROFILE,
          employee_count: 'over_100',
        },
      ),
    ).toBe('unknown');
  });

  it('소상공인 정책 + 매출/직원 명시 → 정상 mismatch (회귀 방지)', () => {
    expect(
      evaluateBusinessMatch('소상공인 매출 5억 이하 융자', {
        ...EMPTY_PROFILE,
        revenue_scale: '1b_10b',
      }),
    ).toBe('mismatch');
  });

  it('자영업자/창업 키워드 정책 → 정상 평가', () => {
    expect(
      evaluateBusinessMatch('자영업자 창업 자금 지원', {
        ...EMPTY_PROFILE,
        revenue_scale: '50m_500m',
        employee_count: '1_4',
      }),
    ).toBe('unknown'); // 명시 요구사항 없으면 unknown (BUSINESS_POLICY_SIGNAL 통과 + matchBusinessProfile 의 hasAnyRequirement 분기)
  });

  // 사회적기업/예비사회적기업 정책 — 사회복지 영역이라 매출 기준 우연 매칭
  // false positive 차단 (lookbehind 로 BUSINESS_POLICY_SIGNAL 에서 제외)
  it('사회적기업 정책 + 매출 키워드 → unknown (false positive 차단)', () => {
    expect(
      evaluateBusinessMatch(
        '사회적기업 지원사업 — 취약계층 고용 매출 5억 이하',
        {
          ...EMPTY_PROFILE,
          revenue_scale: '1b_10b',
        },
      ),
    ).toBe('unknown');
  });
});
