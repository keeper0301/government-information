import { describe, it, expect } from 'vitest';
import { scoreProgram } from '@/lib/personalization/score';
import type { UserSignals } from '@/lib/personalization/types';

// 기본 사용자 프로필 (기준점)
const baseUser: UserSignals = {
  ageGroup: '30대',
  region: '서울',
  district: '강남구',
  occupation: '직장인',
  incomeLevel: 'mid_low',
  householdTypes: ['single_parent'],
  benefitTags: ['주거', '교육'],
};

// 빈 사용자 프로필 (아무 정보도 없는 상태)
const emptyUser: UserSignals = {
  ageGroup: null, region: null, district: null, occupation: null,
  incomeLevel: null, householdTypes: [], benefitTags: [],
};

// 기본 정책 데이터 (기준점)
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

  it('소득 high + 본문에 "기준중위소득" → 가산 없음', () => {
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
