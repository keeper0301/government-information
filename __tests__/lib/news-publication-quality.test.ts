import { expect, it } from 'vitest';
import { validateNewsDraft } from '@/lib/news-publication/validation';
import { validateEditorialQuality } from '@/lib/news-publication/quality';

const source = '행사 참여자에게 10월 중 맞춤형 채용 정보를 제공합니다.';
const draft = { kind: 'report' as const, title: '관광 직무 행사 종료…참여자에 채용 정보 제공',
  question: '행사에 참석하지 않아도 후속 지원을 이용할 수 있나요?',
  answer: '후속 채용 정보는 행사 참여자 대상입니다. 일반 구직자 이용 가능 여부는 별도 확인이 필요합니다.', audience: '행사 참여자와 관광업 재취업을 검토하는 구직자',
  sections: [
    { heading: '행사는 종료됐나요?', paragraphs: ['직무 상담 행사는 이미 끝났습니다. 원문은 행사 현장과 참여자의 상담 경험을 소개하며, 새로운 참가자를 모집하는 공고는 아닙니다.'], quote: source },
    { heading: '후속 정보는 누구에게 제공하나요?', paragraphs: ['10월 중 채용 정보 연계는 기존 참여자를 대상으로 안내됐습니다. 일반 구직자까지 같은 후속 지원을 받을 수 있다고 확대해서 설명할 근거는 없습니다.'], quote: source },
    { heading: '참여하지 않았다면 무엇을 확인하나요?', paragraphs: ['키피오의 제안: 담당 센터에 일반 구직자의 상담 이용 가능 여부를 먼저 문의하세요. 상담 가능 여부와 실제 채용은 구분해 확인하는 편이 좋습니다.'], quote: source },
  ] };
const quality = () => Object.fromEntries(['scope','timeliness','usefulness','clarity','nonRepetition'].map(key => [key,
  { passed: true, reason: '참여자 대상 후속 지원과 일반 구직자의 별도 확인을 구분했습니다.', excerpt: draft.answer }]));
it('짧고 구체적인 행사 설명은 불필요한 분량 없이 통과한다', () => {
  expect(validateNewsDraft(draft, source)).not.toBeNull();
});
it('문장 부호 없이 같은 구절로 분량을 채우는 초안도 차단한다', () => {
  const padded = { ...draft, sections: draft.sections.map(s => ({ ...s, paragraphs: ['대상 조건을 살펴보세요'.repeat(15)] })) };
  expect(validateNewsDraft(padded, source)).toBeNull();
});
it('전체 합격 표시로 개별 품질 검사 누락·실패·가짜 근거를 덮을 수 없다', () => {
  expect(validateEditorialQuality(quality(), draft)).toBe(true);
  expect(validateEditorialQuality({}, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), scope: { passed: false } }, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), clarity: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt: '검사할 글 어디에도 없는 설명입니다.' } }, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), clarity: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt: `${draft.title} ${draft.question}` } }, draft)).toBe(false);
});
