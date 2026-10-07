import { describe, expect, it } from 'vitest';
import { validateNewsDraft, officialNewsId } from '@/lib/news-publication/validation';

const source = '청년 근로자는 10월 7일부터 16일까지 신청합니다. 월 최대 20만원을 지원합니다. 신청 전 소득과 주소를 확인해야 합니다.';
const draft = () => ({ question: '청년 근로자는 무엇을 확인해야 하나요?', answer: '소득과 주소를 먼저 확인하세요.', audience: '청년 근로자',
  sections: [
    { heading: '대상 확인', paragraphs: ['청년 근로자는 소득과 주소를 먼저 대조하고 본인에게 해당하는 조건인지 확인하세요.'.repeat(3)], quote: '청년 근로자는' },
    { heading: '신청 일정', paragraphs: ['10월 7일부터 16일까지라는 신청 일정을 달력에 적고 접수 상태를 확인하세요.'.repeat(3)], quote: '10월 7일부터 16일까지 신청합니다.' },
    { heading: '지원 금액', paragraphs: ['월 최대 20만원이라는 상한을 확정 지급액으로 오해하지 말고 실제 지급 조건을 확인하세요.'.repeat(3)], quote: '월 최대 20만원을 지원합니다.' },
  ] });

const validDraft = () => {
    const value = draft();
    value.sections[0].paragraphs = [
      '청년 근로자는 소득과 주소를 먼저 대조하세요. 본인에게 해당하는 조건인지 확인하는 것이 첫 단계입니다. 키피오의 제안은 담당 창구에 질문할 내용을 미리 적어 두는 것입니다. 이 글은 개인의 자격이나 선정 여부를 확정하지 않습니다. 발표에서 대상이라고 표현된 집단과 실제 접수할 사람을 구분해서 읽어야 신청 전에 생기는 오해를 줄일 수 있습니다. 거주 조건이 맞더라도 다른 조건까지 충족하는지 살펴볼 필요가 있습니다.',
    ];
    value.sections[1].paragraphs = [
      '신청은 10월 7일부터 16일까지로 안내됐습니다. 이 기간을 지원금 지급일로 해석하지 마세요. 키피오의 제안은 달력에 접수할 시점을 표시하고 그 전에 현재 접수 상태를 다시 확인하는 것입니다. 본문의 신청 일정과 실제 창구의 운영 시간을 구별하세요. 신청했다는 사실만으로 심사가 끝났다고 생각하면 이후 안내를 놓칠 수 있습니다. 발표에 심사 절차가 없다면 담당 기관에 확인하고 확인되지 않은 날짜를 임의로 덧붙이지 않는 편이 좋습니다.',
    ];
    value.sections[2].paragraphs = [
      '월 최대 20만원이라는 상한을 모든 신청자에게 같은 금액이 지급된다는 뜻으로 읽지 마세요. 키피오의 제안은 지원 내용을 설명할 때 최대 금액과 본인이 실제로 받는 금액을 따로 적는 것입니다. 이 자료만으로 구체적인 제출 서류나 개별 심사 결과를 확정할 수 없습니다. 숫자를 비교하기 전에 그 숫자가 월 단위인지 전체 기간의 합계인지부터 확인하세요. 본문의 한도를 개인별 확정 금액으로 계산하면 가계 계획을 잘못 세울 수 있으므로 지급 결정 안내를 기준으로 판단하는 것이 필요합니다.',
    ];
    return value;
};

describe('정책뉴스 자동 공개 전 검사', () => {
  it('정확한 근거가 있고 문장 반복 없이 판단 방법을 설명한 글은 통과한다', () => {
    expect(validateNewsDraft(validDraft(), source)).not.toBeNull();
  });
  it('같은 금액의 천 단위 쉼표는 인정하지만 다른 금액은 거부한다', () => {
    const value = validDraft();
    const amountSource = source.replace('20만원', '5000만 원');
    value.sections[2].quote = value.sections[2].quote.replace('20만원', '5000만 원');
    value.sections[2].paragraphs = value.sections[2].paragraphs.map(text => text.replace('20만원', '5,000만원'));
    expect(validateNewsDraft(value, amountSource)).not.toBeNull();
    value.sections[2].paragraphs = value.sections[2].paragraphs.map(text => text.replace('5,000만원', '50,000만원'));
    expect(validateNewsDraft(value, amountSource)).toBeNull();
    value.sections[2].paragraphs = value.sections[2].paragraphs.map(text => text.replace('50,000만원', '500만원'));
    expect(validateNewsDraft(value, amountSource)).toBeNull();
  });
  it('기관 상세 뉴스만 인정하고 외부 주소와 인증 정보는 거부한다', () => {
    expect(officialNewsId('https://www.korea.kr/news/customizedNewsView.do?newsId=148972905&keyType=KW01')).toBe('148972905');
    for (const url of ['https://www.korea.kr', 'https://www.korea.kr.evil.com/news/policyNewsView.do?newsId=148972905',
      'https://user:password@www.korea.kr/news/policyNewsView.do?newsId=148972905', 'http://www.korea.kr/news/policyNewsView.do?newsId=148972905']) expect(officialNewsId(url)).toBeNull();
  });
  it('본문에 없는 인용문과 금액을 공개하지 않는다', () => {
    const value = draft(); value.sections[0].quote = '소득 제한이 없습니다';
    expect(validateNewsDraft(value, source)).toBeNull();
    const fabricated = validDraft(); fabricated.answer = '300만원이 지급됩니다.';
    expect(validateNewsDraft(fabricated, source)).toBeNull();
  });
  it('원문 복사와 너무 짧은 글을 공개하지 않는다', () => {
    const value = draft(); value.sections[0].paragraphs = [source.repeat(4)];
    expect(validateNewsDraft(value, source)).toBeNull();
    expect(validateNewsDraft({ ...draft(), sections: [] }, source)).toBeNull();
  });
  it('같은 문장 반복으로 분량을 채운 글도 보류한다', () => {
    expect(validateNewsDraft(draft(), source)).toBeNull();
  });
});
