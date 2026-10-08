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
it.each(['10월 한 달간', '10월 내내'])('월 중 안내를 월 전체 지원으로 확대하면 보류한다: %s', period => {
  const expanded = { ...draft, answer: `${period} 맞춤형 채용 정보가 제공됩니다. 후속 안내는 기존 행사 참여자를 대상으로 합니다.` };
  expect(newsDraftIssue(expanded, source)).toContain('월 전체');
});
it('원문에 월 전체 기간이 명시되면 해당 안내를 허용한다', () => {
  const original = `${source} 10월 한 달간 채용 정보를 제공합니다.`;
  expect(validateNewsDraft({ ...draft, answer: '10월 한 달간 맞춤형 채용 정보가 제공됩니다. 후속 안내는 기존 행사 참여자를 대상으로 합니다.' }, original)).not.toBeNull();
});
it.each(['행사 참여자만 이용할 수 있습니다.', '참가자에게만 채용 정보를 제공합니다.'])
('대상 안내만으로 비참여자를 배제하면 보류한다: %s', claim => {
  expect(newsDraftIssue({ ...draft, answer: claim }, source)).toContain('이용 제한');
});
it('원문에 명시된 제한과 제한 여부가 미확인이라는 설명은 구분한다', () => {
  const restricted = { ...draft, answer: '행사 참여자만 이용할 수 있습니다.' };
  expect(validateNewsDraft(restricted, `${source} 행사 참여자만 이용할 수 있습니다.`)).not.toBeNull();
  expect(validateNewsDraft({ ...draft, answer: '행사 참여자만 이용할 수 있다는 뜻은 아닙니다. 일반 구직자 이용 가능 여부는 확인이 필요합니다.' }, source)).not.toBeNull();
});
it('원문이 배제 조건을 부정하면 긍정하는 초안의 근거가 될 수 없다', () => {
  expect(newsDraftIssue({ ...draft, answer: '행사 참여자만 이용할 수 있습니다.' },
    `${source} 행사 참여자만 이용할 수 있다는 뜻은 아닙니다.`)).toContain('이용 제한');
});
it('원문이 월 전체 기간을 부정하면 긍정하는 초안의 근거가 될 수 없다', () => {
  expect(newsDraftIssue({ ...draft, answer: '10월 한 달간 지원합니다.' },
    `${source} 10월 한 달간이라는 뜻은 아닙니다.`)).toContain('월 전체');
});
it('다른 조건의 부정으로 월 전체 지원이라는 단정을 숨길 수 없다', () => {
  expect(newsDraftIssue({ ...draft, answer: '10월 한 달간 지원하지만 참여자만 이용한다는 뜻은 아닙니다.' }, source)).toContain('월 전체');
});
it.each(['지원한다는', '제공한다는'])('월 전체 기간에 직접 붙은 부정 동사도 허용한다: %s', verb => {
  expect(validateNewsDraft({ ...draft, answer: `10월 한 달간 ${verb} 뜻은 아닙니다. 원문은 10월 중 후속 지원을 안내합니다.` }, source)).not.toBeNull();
});
it('월 전체 지원을 부정하는 설명과 서로 다른 월의 숫자 경계를 구분한다', () => {
  expect(validateNewsDraft({ ...draft, answer: '10월 한 달간 이용할 수 있다는 뜻은 아닙니다. 원문은 10월 중 후속 지원을 안내합니다.' }, source)).not.toBeNull();
  const otherMonth = '행사 참여자에게 11월 중 정보를 제공합니다. 1월 행사는 종료됐습니다.';
  const separate = { ...draft, answer: '1월 한 달간 지원한 행사와 후속 안내는 구분해야 합니다.',
    sections: draft.sections.map(section => ({ ...section, paragraphs: section.paragraphs.map(text => text.replace('10월', '11월')), quote: otherMonth })) };
  expect(newsDraftIssue(separate, otherMonth)).toBeNull();
});
it('나이 단위를 빠뜨리면 보류하면서 원문 표기를 재작성 안내에 넣는다', () => {
  const missingUnit = { ...draft, answer: '기자단이 소개한 참가자는 54·가명과 51·가명입니다. 행사 경험은 개인의 사례입니다.' };
  const original = `${source} 참가자는 54세와 51세입니다.`;
  expect(validateNewsDraft(missingUnit, original)).toBeNull();
  expect(newsDraftIssue(missingUnit, original)).toContain('54 → 54세, 51 → 51세');
  expect(validateNewsDraft({ ...missingUnit, answer: missingUnit.answer.replace('54·', '54세·').replace('51·', '51세·') }, original)).not.toBeNull();
});
it('원문 숫자가 없거나 같은 숫자에 여러 단위가 있으면 단위를 추측하지 않는다', () => {
  const ambiguous = { ...draft, answer: '기자단은 참가자 54의 사례를 소개했습니다. 행사 경험은 개인의 사례입니다.' };
  expect(newsDraftIssue(ambiguous, `${source} 54세와 54명입니다.`)).toBe('원문에서 확인하지 못한 숫자: 54.');
  expect(newsDraftIssue(ambiguous, source)).toBe('원문에서 확인하지 못한 숫자: 54.');
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

it.each(['맞춤 채용 정보는 행사 참여자 대상으로만 이루어집니다.', '참가자를 대상으로만 채용 정보를 제공합니다.'])
('대상으로만이라는 표현도 근거 없는 이용 제한으로 보류한다: %s', claim => {
  expect(newsDraftIssue({ ...draft, answer: claim }, source)).toContain('이용 제한');
});
it('대상으로만이라는 제한이 원문에 명시되면 허용한다', () => {
  const claim = '행사 참여자 대상으로만 채용 정보를 제공합니다.';
  expect(validateNewsDraft({ ...draft, answer: claim }, `${source} ${claim}`)).not.toBeNull();
});
it('대상으로만이라는 제한을 직접 부정하면 잘못된 단정으로 보지 않는다', () => {
  expect(validateNewsDraft({ ...draft, answer: '행사 참여자 대상으로만 제공된다는 뜻은 아닙니다. 일반 이용 여부는 별도 확인이 필요합니다.' }, source)).not.toBeNull();
});
it('실제 초안의 참여자를 대상으로 한정한다는 표현도 근거 없이 허용하지 않는다', () => {
  const claim = '후속 지원은 행사 참여자를 대상으로 한정되며 일반 구직자 대상 확대 여부는 확인되지 않습니다.';
  expect(newsDraftIssue({ ...draft, answer: claim }, source)).toContain('이용 제한');
  const supported = '후속 지원은 행사 참여자를 대상으로 한정됩니다.';
  expect(validateNewsDraft({ ...draft, answer: supported }, `${source} ${supported}`)).not.toBeNull();
  expect(validateNewsDraft({ ...draft, answer: '행사 참여자를 대상으로 한정된다는 뜻은 아닙니다.' }, source)).not.toBeNull();
});
const caseSource = `${source} 박진우(54세, 가명) 씨는 영업 경력을 살렸습니다. 정은숙(51세, 가명) 씨는 병원 행정 경험을 소개했습니다.`;
const caseDraft = { ...draft, sections: [...draft.sections, { heading: '원문이 소개한 경력 전환 사례',
  paragraphs: ['정책브리핑 기자단이 소개한 박진우(54세, 가명) 씨는 영업 경력의 활용을 고민했습니다.',
    '원문에서 소개한 정은숙(51세, 가명) 씨는 병원 행정 경험과 다른 직무의 연결을 살펴봤습니다.'], quote: source }] };
it('원문에 명시된 두 가명 사례와 취재 주체를 보존하면 허용한다', () => {
  expect(validateNewsDraft(caseDraft, caseSource)).not.toBeNull();
});
it('행사 원문의 가명 사례를 통째로 누락하면 재작성을 요구한다', () => {
  expect(newsDraftIssue(draft, caseSource)).toContain('참가 사례');
});
it('한 사람만 소개하고 다른 가명 사례를 누락해도 보류한다', () => {
  const partial = { ...caseDraft, sections: [...draft.sections, { ...caseDraft.sections[3], paragraphs: [caseDraft.sections[3].paragraphs[0]] }] };
  expect(newsDraftIssue(partial, caseSource)).toContain('정은숙');
});
it('본문에 이름을 쓰면서 가명 표시를 빠뜨리면 보류한다', () => {
  const missing = { ...caseDraft, sections: caseDraft.sections.map(section => ({ ...section,
    paragraphs: section.paragraphs.map(text => text.replace('정은숙(51세, 가명)', '정은숙 씨')) })) };
  expect(newsDraftIssue(missing, caseSource)).toContain('가명');
});
it('원문 인용문에 있는 이름으로 본문 사례 누락을 덮을 수 없다', () => {
  expect(newsDraftIssue({ ...draft, sections: draft.sections.map(section => ({ ...section, quote: caseSource })) }, caseSource)).toContain('참가 사례');
});
it('사례 문단에 원문 취재임을 밝히지 않으면 보류한다', () => {
  const unattributed = { ...caseDraft, sections: caseDraft.sections.map(section => ({ ...section,
    paragraphs: section.paragraphs.map(text => text.replace('정책브리핑 기자단이 소개한 ', '').replace('원문에서 소개한 ', '')) })) };
  expect(newsDraftIssue(unattributed, caseSource)).toContain('원문 취재');
});
it('가명 사례가 없는 공식 원문에는 임의 사례를 필수로 요구하지 않는다', () => {
  expect(validateNewsDraft(draft, `${source} 병원 행정 경험을 소개했습니다.`)).not.toBeNull();
});
it('가명으로 소개한이라는 이름 앞의 표시도 인정한다', () => {
  const beforeName = { ...caseDraft, sections: caseDraft.sections.map(section => ({ ...section,
    paragraphs: section.paragraphs.map(text => text.replace('소개한 박진우(54세, 가명)', '가명으로 소개한 박진우')) })) };
  expect(validateNewsDraft(beforeName, caseSource)).not.toBeNull();
});
it('다른 사람에게 붙은 가명 표시를 해당 사람의 표시로 오인하지 않는다', () => {
  const shared = { ...caseDraft, sections: [...draft.sections, { ...caseDraft.sections[3],
    paragraphs: ['정책브리핑 기자단이 소개한 박진우 씨와 정은숙(가명) 씨가 경력 전환 경험을 설명했습니다.'] }] };
  expect(newsDraftIssue(shared, caseSource)).toContain('박진우의 가명');
});
it.each(['timeliness', 'usefulness', 'coverage'])('대상 이름만으로 내용 품질의 근거를 대신할 수 없다: %s', key => {
  expect(validateEditorialQuality({ ...quality(), [key]: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt: draft.audience } }, draft)).toBe(false);
});
it.each([draft.title, draft.question, draft.sections[0].heading])('제목·질문·소제목만으로 품질을 입증할 수 없다: %s', excerpt => {
  expect(validateEditorialQuality({ ...quality(), coverage: { passed: true, reason: '충분한 구체적인 판정 이유입니다.', excerpt } }, draft)).toBe(false);
});
it('적용 범위 항목에서는 실제 대상 문구도 근거로 허용한다', () => {
  expect(validateEditorialQuality({ ...quality(), scope: { passed: true, reason: '공식 대상과 초안 대상이 같음을 대조했습니다.', excerpt: draft.audience } }, draft)).toBe(true);
});
