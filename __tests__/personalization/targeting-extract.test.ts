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
