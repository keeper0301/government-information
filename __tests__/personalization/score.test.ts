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
// welfare_programs.region 은 광역+시군구를 한 문자열로 저장하므로 ("서울특별시 강남구")
// district 별도 컬럼은 score 로직에서 사용하지 않음 (DB 에 컬럼 자체 없음).
const baseProgram = {
  id: 'p1',
  title: '청년 주거 지원',
  description: '서울 강남구 청년 대상 주거비 지원',
  region: '서울특별시 강남구',
  district: null as string | null,
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

describe('scoreProgram — Phase 1.5 정확 매칭', () => {
  it('income_target_level=low + 사용자 low → +4', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'low' as const },
      { ...emptyUser, incomeLevel: 'low' },
    );
    expect(r.score).toBe(4);
    expect(r.signals.find(s => s.kind === 'income_target')).toBeDefined();
  });

  it('income_target_level=mid + 사용자 low → +4 (low 가 mid 자격 충족)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'mid' as const },
      { ...emptyUser, incomeLevel: 'low' },
    );
    expect(r.score).toBe(4);
  });

  it('income_target_level=low + 사용자 high → 0 (자격 미달)', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'low' as const },
      { ...emptyUser, incomeLevel: 'high' },
    );
    expect(r.score).toBe(0);
  });

  it('income_target_level=any → 모든 사용자 +4', () => {
    const r = scoreProgram(
      { ...baseProgram, region: null, district: null, benefit_tags: [],
        income_target_level: 'any' as const },
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
        income_target_level: 'low' as const },
      { ...emptyUser, incomeLevel: 'high' },
    );
    // 정확 매칭이 있는데 high 는 자격 없음 → fallback 없이 0점
    expect(r.score).toBe(0);
  });
});

describe('scoreProgram — 시군구 mismatch (Phase 1.6)', () => {
  // 30대 자영업자 순천시 사용자가 영암군 정책에 매칭되던 버그 재현·차단
  it('같은 광역인데 다른 시군구 명시 → region 점수 0', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 영암군',
        title: '영암군 이사비용 지원',
        description: '주거 이전 비용 지원',
        benefit_tags: [],
      },
      { ...emptyUser, region: '전남', district: '순천시' },
    );
    expect(r.score).toBe(0);
    expect(r.signals.find((s) => s.kind === 'region')).toBeUndefined();
  });

  it('같은 시군구 정확 매칭 → +10', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 순천시',
        benefit_tags: [],
        description: '순천시 청년 주거 지원',
      },
      { ...emptyUser, region: '전남', district: '순천시' },
    );
    expect(r.score).toBe(10);
  });

  it('광역만 명시된 정책 (시군구 명시 없음) → +5', () => {
    const r = scoreProgram(
      { ...baseProgram, region: '전라남도', benefit_tags: [], description: '전남 주민 대상' },
      { ...emptyUser, region: '전남', district: '순천시' },
    );
    expect(r.score).toBe(5);
  });

  it('사용자 시군구 미선택 + 정책에 시군구 명시 → region_only +5', () => {
    const r = scoreProgram(
      { ...baseProgram, region: '전라남도 영암군', benefit_tags: [], description: '주거 지원' },
      { ...emptyUser, region: '전남' /* district 없음 */ },
    );
    expect(r.score).toBe(5);
  });

  it('"서울특별시" 잔재가 다른 시군구로 오인되지 않아야 함 (긴 별칭 우선 strip)', () => {
    // strip 순서가 잘못되면 "서울" 만 빠지고 "특별시" 가 시군구로 인식될 수 있음
    const r = scoreProgram(
      { ...baseProgram, region: '서울특별시', benefit_tags: [], description: '서울 시민 대상' },
      { ...emptyUser, region: '서울', district: '강남구' },
    );
    // 광역 only 정책으로 판정 → +5
    expect(r.score).toBe(5);
  });
});

describe('scoreProgram — Cohort 부적합 차단 (Phase 1.6)', () => {
  it('노인/어르신/보청기 정책 + 30대 사용자 → score 0', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 나주시',
        benefit_tags: [],
        title: '나주시 노인 보청기 구입비 지원',
        description: '만 65세 이상 어르신 대상',
      },
      { ...emptyUser, ageGroup: '30대', region: '전남', district: '나주시' },
    );
    expect(r.score).toBe(0);
  });

  it('노인 정책 + 60대 이상 사용자 → 정상 점수', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 나주시',
        benefit_tags: [],
        title: '어르신 틀니지원',
        description: '경로우대 대상',
      },
      { ...emptyUser, ageGroup: '60대 이상', region: '전남', district: '나주시' },
    );
    // region_district +10, age 키워드("어르신") +1 → 11
    expect(r.score).toBe(11);
  });

  it('결혼이주여성 정책 + 일반 사용자 → score 0', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 완도군',
        benefit_tags: [],
        title: '결혼이주여성 행복정착금',
        description: '다문화 가정 정착 지원',
      },
      { ...emptyUser, ageGroup: '30대', region: '전남' },
    );
    expect(r.score).toBe(0);
  });

  it('보호아동 정책 + 자녀 동반 가구 아닌 사용자 → score 0', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: null,
        benefit_tags: [],
        title: '보호아동 생활안정 지원',
        description: '아동복지시설 입소 아동 대상',
      },
      { ...emptyUser, householdTypes: ['married'] },
    );
    expect(r.score).toBe(0);
  });

  it('보호아동 정책 + 한부모 가구 → cohort 매칭 통과', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: null,
        benefit_tags: [],
        title: '보호아동 양육비 지원',
        description: '한부모 가정 양육비 지원',
      },
      { ...emptyUser, householdTypes: ['single_parent'] },
    );
    // 보호아동 cohort 통과 + household_keyword fallback (한부모) +2
    expect(r.score).toBe(2);
  });

  it('중증장애 정책 + disabled_family 가구 아닌 사용자 → score 0', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: null,
        benefit_tags: [],
        title: '중증장애 의료비 지원',
        description: '장애아동 가구 대상',
      },
      { ...emptyUser, householdTypes: ['married'] },
    );
    expect(r.score).toBe(0);
  });

  it('장애인 정책 + disabled_family 가구 → cohort 매칭 통과', () => {
    const r = scoreProgram(
      {
        ...baseProgram,
        region: null,
        benefit_tags: [],
        title: '중증장애 의료비 지원',
        description: '중증장애 가구 대상',
        household_target_tags: ['disabled_family'],
      },
      { ...emptyUser, householdTypes: ['disabled_family'] },
    );
    // household_target +3
    expect(r.score).toBe(3);
  });
});
