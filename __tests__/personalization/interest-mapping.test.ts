import { describe, it, expect } from 'vitest';
import {
  INTEREST_TO_BENEFIT_TAGS,
  interestsToBenefitTags,
} from '@/lib/personalization/interest-mapping';

describe('interestsToBenefitTags', () => {
  it('빈 배열·null 입력 → 빈 배열', () => {
    expect(interestsToBenefitTags([])).toEqual([]);
    expect(interestsToBenefitTags(null)).toEqual([]);
  });

  it('단일 interest → 매핑된 tag(s)', () => {
    expect(interestsToBenefitTags(['주거'])).toEqual(['주거']);
    expect(interestsToBenefitTags(['고용'])).toEqual(['취업']);
    expect(interestsToBenefitTags(['대출'])).toEqual(['금융']);
    expect(interestsToBenefitTags(['출산·육아'])).toEqual(['양육']);
  });

  it('복지·청년 은 매핑 없음 (의도적)', () => {
    expect(interestsToBenefitTags(['복지'])).toEqual([]);
    expect(interestsToBenefitTags(['청년'])).toEqual([]);
    expect(interestsToBenefitTags(['복지', '주거'])).toEqual(['주거']);
  });

  it('여러 interest → 중복 제거 후 합집합', () => {
    const result = interestsToBenefitTags(['주거', '의료', '주거']);
    expect(result.sort()).toEqual(['의료', '주거']);
  });

  it('알 수 없는 interest → 무시', () => {
    expect(interestsToBenefitTags(['알수없음', '주거'])).toEqual(['주거']);
  });

  it('실제 마이페이지 INTERESTS 9개 모두 BENEFIT_TAGS 14종에서 가져옴 (또는 빈 배열)', () => {
    const validBenefits = ['주거','의료','양육','교육','문화','취업','창업',
                           '금융','생계','에너지','교통','장례','법률','기타'];
    for (const tags of Object.values(INTEREST_TO_BENEFIT_TAGS)) {
      for (const tag of tags) {
        expect(validBenefits).toContain(tag);
      }
    }
  });
});
