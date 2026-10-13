import { describe, expect, it } from 'vitest';
import { validateNewsDraft, officialNewsId } from '@/lib/news-publication/validation';

const source = '청년 근로자는 10월 7일부터 16일까지 신청합니다. 월 최대 20만원을 지원합니다. 신청 전 소득과 주소를 확인해야 합니다.';
const draft = () => ({ kind: 'application', title: '청년 근로자 지원 신청 일정과 지급 상한', question: '청년 근로자는 무엇을 확인해야 하나요?', answer: '소득과 주소를 먼저 확인하세요.', audience: '청년 근로자',
  sections: [
    { heading: '대상 확인', paragraphs: ['청년 근로자는 소득과 주소를 먼저 대조하고 본인에게 해당하는 조건인지 확인하세요.'.repeat(3)], quote: '청년 근로자는' },
    { heading: '신청 일정', paragraphs: ['10월 7일부터 16일까지라는 신청 일정을 달력에 적고 접수 상태를 확인하세요.'.repeat(3)], quote: '10월 7일부터 16일까지 신청합니다.' },
    { heading: '지원 금액', paragraphs: ['월 최대 20만원이라는 상한을 확정 지급액으로 오해하지 말고 실제 지급 조건을 확인하세요.'.repeat(3)], quote: '월 최대 20만원을 지원합니다.' },
  ] });

const validDraft = () => ({ ...draft(), sections: [
  { heading: '대상을 어떻게 확인하나요?', paragraphs: ['청년 근로자는 소득과 주소 조건을 먼저 비교하세요. 키피오의 제안: 거주 조건이 맞더라도 소득 조건까지 충족하는지 담당 창구에 문의할 내용을 정리해두세요. 이 글만으로 개인의 자격을 확정할 수는 없습니다.'], quote: '청년 근로자는' },
  { heading: '신청 기간과 지급일은 같나요?', paragraphs: ['접수는 10월 7일부터 16일까지입니다. 이 기간을 지급일로 읽지 마세요. 신청했다는 사실과 지급 결정은 구분해서 확인해야 하며, 발표에 없는 심사 완료 날짜를 임의로 안내하면 안 됩니다.'], quote: '10월 7일부터 16일까지 신청합니다.' },
  { heading: '모두 같은 금액을 받나요?', paragraphs: ['월 최대 20만원은 지급 상한입니다. 모든 신청자에게 같은 금액이 확정된다는 뜻으로 해석하지 마세요. 키피오의 제안: 가계 계획에는 최고 한도와 실제로 결정된 지급액을 구분해 기록하세요.'], quote: '월 최대 20만원을 지원합니다.' },
] });

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
