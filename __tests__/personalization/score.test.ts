import { describe, it, expect } from 'vitest';
import { scoreProgram, isProgramAllowedForUser } from '@/lib/personalization/score';
import type { UserSignals } from '@/lib/personalization/types';

// 빈 사용자 프로필 (아무 정보도 없는 상태)
const emptyUser: UserSignals = {
  ageGroup: null, region: null, district: null, occupation: null,
  incomeLevel: null, householdTypes: [], benefitTags: [], hasChildren: null, merit: null,
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

  // ⑦-Gate: Household mismatch gate (2026-04-28 사장님 사고 회귀 가드)
  // 정책이 disabled_family 명시 + 사용자 [married] → benefit/region 점수 무관 강제 차단
  it('household_target_tags=[disabled_family] + 사용자 [married] → 강제 0 (mismatch gate)', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        benefit_tags: ['주거', '의료', '취업'], // 사용자와 다수 일치 (12점)
        household_target_tags: ['disabled_family'] },
      { ...emptyUser,
        region: '전남',
        householdTypes: ['married'],
        benefitTags: ['주거', '의료', '취업', '교육'] },
    );
    expect(r.score).toBe(0);
    expect(r.signals).toEqual([]);
  });

  it('household_target_tags=[multi_child] + 사용자 [married] → 강제 0', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '경남 창원시',
        benefit_tags: ['양육', '금융'],
        household_target_tags: ['multi_child'] },
      { ...emptyUser,
        region: '전남',
        district: '순천시',
        householdTypes: ['married'],
        benefitTags: ['양육', '금융'] },
    );
    expect(r.score).toBe(0);
  });

  it('household_target_tags 명시 + 사용자 householdTypes 빈 배열 → 게이트 적용 안 함 (빈 프로필 보존)', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        benefit_tags: ['주거'],
        household_target_tags: ['disabled_family'] },
      { ...emptyUser,
        region: '전남',
        householdTypes: [], // 빈 배열 — 빈 프로필 사용자
        benefitTags: ['주거'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('household_target_tags=[] (빈 배열) → 게이트 적용 안 함 (정책 제한 없음)', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        benefit_tags: ['주거'],
        household_target_tags: [] },
      { ...emptyUser,
        region: '전남',
        householdTypes: ['married'],
        benefitTags: ['주거'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  // ⓪ Cohort 차단 추가 (2026-04-28 사장님 사고 회귀 가드)
  it('결식아동급식 정책 + [married] 사용자 → cohort 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전남',
        title: '결식아동 급식 지원',
        benefit_tags: ['양육'] },
      { ...emptyUser,
        region: '전남',
        householdTypes: ['married'],
        benefitTags: ['양육'] },
    );
    expect(r.score).toBe(0);
  });

  it('아동급식 + single_parent 사용자 → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전남',
        title: '학기중 아동급식 지원',
        benefit_tags: ['양육'] },
      { ...emptyUser,
        region: '전남',
        householdTypes: ['single_parent'],
        benefitTags: ['양육'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('통합사례관리 정책 + mid 사용자 → cohort 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        title: '희망복지지원단 통합사례관리사업',
        benefit_tags: ['주거', '의료', '취업'] },
      { ...emptyUser,
        region: '전남',
        incomeLevel: 'mid',
        benefitTags: ['주거', '의료', '취업'] },
    );
    expect(r.score).toBe(0);
  });

  it('통합사례관리 정책 + low 사용자 → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        title: '희망복지지원단 통합사례관리사업',
        benefit_tags: ['주거'] },
      { ...emptyUser,
        region: '전남',
        incomeLevel: 'low',
        benefitTags: ['주거'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('기초수급자 정책 + mid 사용자 → cohort 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        description: '기초생활수급자 대상 지원',
        benefit_tags: ['주거', '의료'] },
      { ...emptyUser,
        region: '전남',
        incomeLevel: 'mid',
        benefitTags: ['주거', '의료'] },
    );
    expect(r.score).toBe(0);
  });

  // 2026-04-28 사장님 화면 사고: "기초생활보장수급자및복지시설생활자위문" 노출
  // 정규식 /기초생활수급자/ 가 "기초생활보장수급자" 사이 "보장" 때문에 매칭 안 됨.
  it('기초생활보장수급자 정책 (보장 끼움) + mid 사용자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '기초생활보장수급자및복지시설생활자위문',
        region: '전라남도 순천시',
        description: '생활이 어려운 저소득층 및 사회복지시설 위문',
        benefit_tags: ['생계', '의료'] },
      { ...emptyUser,
        region: '전남',
        district: '순천시',
        incomeLevel: 'mid',
        benefitTags: ['생계', '의료'] },
    );
    expect(r.score).toBe(0);
  });

  it('기초생활 보장 수급자 (공백 변형) + mid 사용자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        description: '기초생활 보장 수급자 대상 지원',
        benefit_tags: ['주거'] },
      { ...emptyUser,
        region: '전남',
        incomeLevel: 'mid',
        benefitTags: ['주거'] },
    );
    expect(r.score).toBe(0);
  });

  // 회귀 가드 — low 사용자는 그대로 통과해야 함 (gate 가 mid 만 차단)
  it('기초생활보장수급자 정책 + low 사용자 → 통과 (점수 > 0)', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '기초생활보장수급자 위문',
        region: '전국',
        description: '저소득층 위문',
        benefit_tags: ['생계'] },
      { ...emptyUser,
        region: '전남',
        incomeLevel: 'low',
        benefitTags: ['생계'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  // 2026-04-28 사장님 화면 사고 후속 — 농촌유학 차단 (자녀 시그널 없음)
  it('농촌유학 정책 + has_children=NULL 사용자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '농촌유학 지원사업',
        region: '전라남도',
        description: '농촌 유학 가구 주거비 등 유학경비 지원',
        benefit_tags: ['교육', '주거'] },
      { ...emptyUser,
        region: '전남',
        householdTypes: ['married'],
        benefitTags: ['교육', '주거'] },
    );
    expect(r.score).toBe(0);
  });

  it('농촌유학 정책 + has_children=true 사용자 → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '농촌유학 지원사업',
        region: '전라남도',
        description: '농촌 유학 가구 주거비 등',
        benefit_tags: ['교육'] },
      { ...emptyUser,
        region: '전남',
        hasChildren: true,
        benefitTags: ['교육'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  // 2026-04-28 사장님 화면 사고 — 보훈 cohort 차단 (모든 일반 사용자)
  it('국가유공자 교통시설 이용지원 + 일반 사용자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '교통시설 이용지원(버스,내항여객선,KTX등)',
        region: '전국',
        description: '애국지사 및 국가유공상이자 등의 교통권 보장',
        benefit_tags: ['교통'] },
      { ...emptyUser,
        region: '전남',
        occupation: '자영업자',
        benefitTags: ['교통'] },
    );
    expect(r.score).toBe(0);
  });

  it('보훈대상자 정책 + 직장인 (merit=null) → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '보훈대상자 의료비 지원',
        region: '전국',
        description: '보훈대상자 본인부담금 지원',
        benefit_tags: ['의료'] },
      { ...emptyUser,
        region: '서울',
        occupation: '직장인',
        benefitTags: ['의료'] },
    );
    expect(r.score).toBe(0);
  });

  // 2026-04-28 마이그레이션 064 — merit 시그널 도입 후 통과 케이스
  it('국가유공자 정책 + merit=merit 사용자 → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '교통시설 이용지원(국가유공자)',
        region: '전국',
        description: '국가유공자 교통권 보장',
        benefit_tags: ['교통'] },
      { ...emptyUser,
        region: '전남',
        merit: 'merit',
        benefitTags: ['교통'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('보훈대상자 정책 + merit=none 명시 사용자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '보훈대상자 의료비 지원',
        region: '전국',
        description: '보훈대상자 본인부담금 지원',
        benefit_tags: ['의료'] },
      { ...emptyUser,
        region: '서울',
        merit: 'none',
        benefitTags: ['의료'] },
    );
    expect(r.score).toBe(0);
  });

  // 2026-04-28 사장님 화면 사고 — 농어민 cohort 차단 (자영업자에게)
  it('영암군 농어민 공익수당 + 자영업자 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '영암군 농어민 공익수당',
        region: '전라남도 영암군',
        description: '농민과 어민의 삶의 질 향상',
        benefit_tags: ['생계'] },
      { ...emptyUser,
        region: '전남',
        occupation: '자영업자',
        benefitTags: ['생계'] },
    );
    expect(r.score).toBe(0);
  });

  it('농민수당 정책 + 직장인 → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '농민수당 지급',
        region: '전라남도',
        description: '농가 경영 안정',
        benefit_tags: ['생계'] },
      { ...emptyUser,
        region: '전남',
        occupation: '직장인',
        benefitTags: ['생계'] },
    );
    expect(r.score).toBe(0);
  });

  // 2026-04-28 OCCUPATION_OPTIONS 에 '농어민' 추가 후 — 농어민 본인은 통과
  it('영암군 농어민 공익수당 + 농어민 직군 → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        title: '영암군 농어민 공익수당',
        region: '전라남도 영암군',
        description: '농민과 어민의 삶의 질 향상',
        benefit_tags: ['생계'] },
      { ...emptyUser,
        region: '전남',
        occupation: '농어민',
        benefitTags: ['생계'] },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  // 산후조리·영유아 cohort gate (2026-04-28 사장님 사고 후속)
  it('산후조리 정책 + hasChildren=false → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전남 순천시',
        title: '산후조리비용 지원',
        benefit_tags: ['의료', '양육', '금융'] },
      { ...emptyUser,
        region: '전남',
        district: '순천시',
        householdTypes: ['married'],
        benefitTags: ['의료', '양육', '금융'],
        hasChildren: false },
    );
    expect(r.score).toBe(0);
  });

  it('산후조리 정책 + hasChildren=true → 통과', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전남 순천시',
        title: '산후조리비용 지원',
        benefit_tags: ['의료', '양육'] },
      { ...emptyUser,
        region: '전남',
        district: '순천시',
        householdTypes: ['married'],
        benefitTags: ['의료', '양육'],
        hasChildren: true },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('산후조리 정책 + hasChildren=null (미입력) → 통과 (보수적, 입력 유도용)', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전남 순천시',
        title: '산후조리비용 지원',
        benefit_tags: ['의료', '양육'] },
      { ...emptyUser,
        region: '전남',
        district: '순천시',
        benefitTags: ['의료', '양육'],
        hasChildren: null },
    );
    expect(r.score).toBeGreaterThan(0);
  });

  it('영유아 정책 + hasChildren=false → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        title: '영유아 보육료 지원',
        benefit_tags: ['양육'] },
      { ...emptyUser,
        region: '전남',
        benefitTags: ['양육'],
        hasChildren: false },
    );
    expect(r.score).toBe(0);
  });

  it('출산축하금 정책 + hasChildren=false → 차단', () => {
    const r = scoreProgram(
      { ...baseProgram,
        region: '전국',
        title: '출산축하금 지원',
        benefit_tags: ['양육', '금융'] },
      { ...emptyUser,
        region: '전남',
        benefitTags: ['양육', '금융'],
        hasChildren: false },
    );
    expect(r.score).toBe(0);
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

  // 2026-04-26 hot-fix: regional gate 추가. region mismatch 면 다른 시그널
  // 점수 무관하게 score=0. 아래 두 케이스가 회귀 가드.
  it('regional gate: 다른 광역 + benefit_tags 4개 매칭 → score 0', () => {
    // 사장님(전남 순천시)에게 전북 장수군 결혼축하금이 노출되던 실제 사고 재현
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전북특별자치도 장수군',
        title: '결혼축하금 지원',
        description: '인구증가 다양한 지원',
        benefit_tags: ['양육', '교육', '취업', '금융'],
      },
      {
        ...emptyUser,
        region: '전남',
        district: '순천시',
        benefitTags: ['양육', '교육', '취업', '금융', '주거'],
      },
    );
    // 게이트 없으면 +12 (benefit_tags 4개 × 3) → minScore=8 통과 사고.
    // 게이트 적용 → 0
    expect(r.score).toBe(0);
    expect(r.signals).toEqual([]);
  });

  it('regional gate: 같은 광역 다른 시군구 + household_target 매칭 → score 0', () => {
    // 영암군 신혼부부 정책이 순천시 사용자에게 household 매칭으로 통과되던 사고
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '전라남도 영암군',
        title: '영암군 이사비용 지원',
        description: '신혼부부 주거 이전 비용',
        benefit_tags: ['주거', '금융'],
        household_target_tags: ['married'],
      },
      {
        ...emptyUser,
        region: '전남',
        district: '순천시',
        householdTypes: ['married'],
        benefitTags: ['주거', '금융'],
      },
    );
    // 게이트 없으면 benefit(+6) + household_target(+3) = 9 → 통과 사고
    expect(r.score).toBe(0);
  });

  it('regional gate: 사용자 region 미설정 → 게이트 미적용, 다른 시그널로 매칭 가능', () => {
    // region 비워둔 사용자도 benefit_tags·age 등으로 추천 받을 수 있어야 함
    const r = scoreProgram(
      {
        ...baseProgram,
        region: '경상남도 창원시',
        benefit_tags: ['취업'],
      },
      { ...emptyUser, /* region 없음 */ benefitTags: ['취업'] },
    );
    expect(r.score).toBe(3);
  });

  // 2026-04-26 hot-fix-2: gate 가 너무 넓어서 발생한 회귀 가드
  it('regional gate: program.region NULL → 게이트 미적용 (blog 카테고리 기반)', () => {
    // blog 는 region 컬럼 없음 → ScorableItem.region=null. 사용자 region 설정해도
    // benefit_tags 매칭으로 추천돼야 함 (게이트로 모두 차단되면 안 됨).
    const r = scoreProgram(
      { ...baseProgram, region: null, benefit_tags: ['취업'] },
      { ...emptyUser, region: '전남', district: '순천시', benefitTags: ['취업'] },
    );
    expect(r.score).toBe(3);
  });

  // news 부처명 ministry 케이스는 데이터 layer (app/news/page.tsx) 에서 region=null 로
  // 변환해 게이트 우회시킴 — 이 테스트는 score.ts 차원이 아니라 데이터 변환 책임을
  // 명시. 부처명을 region 으로 그대로 넘기면 차단되는 건 의도된 동작 (page 가 책임).

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

// ============================================================
// isProgramAllowedForUser — alert-dispatch cohort gate
// ============================================================
// 알림 발송 매칭에 score.ts 의 cohort gate 적용 (사장님 사고 후속).
// 사용자가 마이페이지 "자녀 없음" 선택 시 산후조리 알림톡 발송 차단.
describe('isProgramAllowedForUser', () => {
  it('산후조리 정책 + hasChildren=false → 차단 (false 반환)', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '산후조리비용 지원', description: null },
      { ...emptyUser, hasChildren: false },
    );
    expect(result).toBe(false);
  });

  it('산후조리 정책 + hasChildren=true → 통과', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '산후조리비용 지원', description: null },
      { ...emptyUser, hasChildren: true },
    );
    expect(result).toBe(true);
  });

  it('산후조리 정책 + hasChildren=null (미입력) → 통과 (보수적)', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '산후조리비용 지원', description: null },
      { ...emptyUser, hasChildren: null },
    );
    expect(result).toBe(true);
  });

  it('장애인 자립 정책 + householdTypes=[married] → 차단', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '장애인 자립지원',
        household_target_tags: ['disabled_family'] },
      { ...emptyUser, householdTypes: ['married'] },
    );
    expect(result).toBe(false);
  });

  it('결식아동급식 + householdTypes=[married] → 차단', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '결식아동 급식 지원', description: null },
      { ...emptyUser, householdTypes: ['married'] },
    );
    expect(result).toBe(false);
  });

  it('통합사례관리 + incomeLevel=mid → 차단', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '희망복지지원단 통합사례관리', description: null },
      { ...emptyUser, incomeLevel: 'mid' },
    );
    expect(result).toBe(false);
  });

  it('일반 정책 + 사장님 프로필 → 통과', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '소상공인 정책자금', description: '운영자금 지원' },
      { ...emptyUser, householdTypes: ['married'], hasChildren: false, incomeLevel: 'mid' },
    );
    expect(result).toBe(true);
  });

  it('빈 프로필 사용자 + 어떤 cohort 정책 → 통과 (게이트 미적용)', () => {
    const result = isProgramAllowedForUser(
      { id: '1', title: '산후조리비용 지원',
        household_target_tags: ['disabled_family'] },
      { ...emptyUser }, // householdTypes=[], hasChildren=null
    );
    expect(result).toBe(true);
  });
});
