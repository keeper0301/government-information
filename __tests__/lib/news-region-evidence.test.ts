import { describe, expect, it } from 'vitest';
import { classifyEditorialNews } from '@/lib/news-publication/classification';

describe('공식 원문의 지역 근거', () => {
  it('정책의 범위를 밝힌 문장과 행사 개최 장소만 보완한다', () => {
    const result = classifyEditorialNews('수도권 주택 착공·입주자 모집', '정부는 수도권에서 공공주택 입주자를 모집한다.');
    expect(result.regions).toEqual(['seoul', 'incheon', 'gyeonggi']);
    expect(result.regionEvidence).toContain('수도권에서');
    expect(classifyEditorialNews('코리안 페스티벌 종료', '송도 센트럴파크 잔디광장에서 열린 공연이다.').regions).toEqual(['incheon']);
  });
  it('주제가 다르거나 사례·사진·설문에만 지역이 나오면 추측하지 않는다', () => {
    for (const body of ['서울에서 촬영한 사진이다.', '전국 3000명 설문이다.', '송도 센트럴파크 잔디광장에서 열린 행사 참석자의 사례다.']) {
      expect(classifyEditorialNews('어린이집 신청 안내', body).regions).toEqual(['unclassified']);
    }
    expect(classifyEditorialNews('수도권 주택 모집', '주택 신청자의 인천 여행 사례다.').regions).toEqual(['unclassified']);
  });
  it('제목에 확정된 지역을 본문 사례로 덮어쓰지 않는다', () => {
    expect(classifyEditorialNews('부산 예방접종', '전국 위탁의료기관 및 보건소에서 무료로 예방접종을 받을 수 있으며').regions).toEqual(['busan']);
  });
});
