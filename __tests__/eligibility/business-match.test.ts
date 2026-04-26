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
});
