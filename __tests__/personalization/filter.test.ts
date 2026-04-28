import { describe, it, expect } from 'vitest';
import { scoreAndFilter } from '@/lib/personalization/filter';
import type { UserSignals } from '@/lib/personalization/types';

// 테스트용 사용자 프로필
const user: UserSignals = {
  ageGroup: '30대', region: '서울', district: null,
  occupation: '직장인', incomeLevel: null, householdTypes: [],
  benefitTags: ['주거'], hasChildren: null, merit: null,
};

// 테스트용 정책 목록 (서울 주거, 부산 의료, 전국 취업, 서울 양육)
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
    // a(서울+주거=8점), c(전국+청년신혼+직장인=5~8점), d(서울=5점) → 통과
    // b(부산=0점) → 제외
    expect(r.map(x => x.item.id)).toEqual(expect.arrayContaining(['a', 'c', 'd']));
    expect(r.find(x => x.item.id === 'b')).toBeUndefined();
  });

  it('점수 내림차순 정렬', () => {
    const r = scoreAndFilter(programs, user, { minScore: 1, limit: 10 });
    // 점수가 높은 항목이 앞에 와야 함
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it('limit 제한', () => {
    const r = scoreAndFilter(programs, user, { minScore: 1, limit: 2 });
    // 최대 2개만 반환
    expect(r.length).toBe(2);
  });

  it('빈 프로필 입력 → 빈 배열', () => {
    const r = scoreAndFilter(programs, {
      ageGroup: null, region: null, district: null, occupation: null,
      incomeLevel: null, householdTypes: [], benefitTags: [], hasChildren: null,
      merit: null,
    }, { minScore: 5, limit: 10 });
    // 아무 매칭도 없으므로 모두 0점 → minScore 5 미만 → 빈 배열
    expect(r).toEqual([]);
  });
});
