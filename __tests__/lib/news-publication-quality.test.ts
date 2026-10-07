import { expect, it } from 'vitest';
import { validateNewsDraft, newsDraftIssue } from '@/lib/news-publication/validation';
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
const quality = () => Object.fromEntries(['scope','timeliness','usefulness','clarity','nonRepetition','coverage'].map(key => [key,
  { passed: true, reason: '참여자 대상 후속 지원과 일반 구직자의 별도 확인을 구분했습니다.', excerpt: draft.answer }]));
it('짧고 구체적인 행사 설명은 불필요한 분량 없이 통과한다', () => {
  expect(validateNewsDraft(draft, source)).not.toBeNull();
});
it('공식 발표일에 확인된 연도만 숫자 근거로 인정한다', () => {
  const dated = { ...draft, question: '2026년 발표된 행사에서 무엇을 확인할 수 있나요?' };
  expect(validateNewsDraft(dated, source)).toBeNull();
  expect(validateNewsDraft(dated, source, '2026-10-06')).not.toBeNull();
  expect(validateNewsDraft({ ...dated, question: dated.question.replace('2026년', '2027년') }, source, '2026-10-06')).toBeNull();
  expect(validateNewsDraft(dated, source, '임의의 날짜')).toBeNull();
  expect(validateNewsDraft(dated, source, '2026-02-30')).toBeNull();
});
it('현장·사례 설명이 추가된 네 부분 기사를 허용하고 일곱 부분은 제한한다', () => {
  const extra = { heading: '경험을 비교할 때 주의할 점', paragraphs: ['참가자가 이야기한 경력 전환 경험은 개인의 사례입니다. 모든 구직자에게 같은 결과가 생긴다는 뜻이 아니므로 본인 경력과 구분하여 읽는 편이 좋습니다.'], quote: source };
  expect(validateNewsDraft({ ...draft, sections: [...draft.sections, extra] }, source)).not.toBeNull();
  expect(validateNewsDraft({ ...draft, sections: [...draft.sections, extra, extra, extra, extra] }, source)).toBeNull();
});
it.each(['코드를 수정하세요.', '검수자가 봐도 서비스 목적이 드러나도록 작성하세요.',
  '이 문단을 구현하고 배포하세요.', '본문에 이 설명을 추가하세요.', '프롬프트 지침을 따르세요.'])
('작성·개발 작업 지시가 독자용 글에 섞이면 보류한다: %s', instruction => {
  const leaked = { ...draft, answer: instruction };
  expect(newsDraftIssue(leaked, source)).toContain('작업 지시');
});
it('독자에게 필요한 서류 준비·신청 안내는 작업 지시로 오인하지 않는다', () => {
  const readerAdvice = { ...draft, answer: '상담 전에 이력서를 준비하세요. 기관의 공식 신청 화면에서 예약할 수 있습니다.' };
  expect(validateNewsDraft(readerAdvice, source)).not.toBeNull();
});
it('문장 부호 없이 같은 구절로 분량을 채우는 초안도 차단한다', () => {
  const padded = { ...draft, sections: draft.sections.map(s => ({ ...s, paragraphs: ['대상 조건을 살펴보세요'.repeat(15)] })) };
  expect(validateNewsDraft(padded, source)).toBeNull();
});
it('전체 합격 표시로 개별 품질 검사 누락·실패·가짜 근거를 덮을 수 없다', () => {
  expect(validateEditorialQuality(quality(), draft)).toBe(true);
  expect(validateEditorialQuality({}, draft)).toBe(false);
  const missingCoverage = quality(); delete missingCoverage.coverage;
  expect(validateEditorialQuality(missingCoverage, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), coverage: { passed: false } }, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), scope: { passed: false } }, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), clarity: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt: '검사할 글 어디에도 없는 설명입니다.' } }, draft)).toBe(false);
  expect(validateEditorialQuality({ ...quality(), clarity: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt: `${draft.title} ${draft.question}` } }, draft)).toBe(false);
});
