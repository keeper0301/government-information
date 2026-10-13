import { expect, it } from 'vitest';
import { medicalConditionIssue } from '@/lib/news-publication/medical-condition';
import type { NewsDraft } from '@/lib/news-publication/validation';

const source = '인과성이 인정되지 않으면 복무 중에 발생한 중증 난치성 질환에 한해 본인부담금의 50%만 지원됐다.';
const draft = (text: string): NewsDraft => ({ kind: 'change', title: '제대군인 의료비 지원',
  question: '의료비 지원은 어떻게 달라지나요?', answer: text, audience: '제대군인',
  sections: [{ heading: '기존 의료비 지원', paragraphs: [text], quote: source }],
});

it.each([
  '인과성이 없으면 본인 부담금의 50%만 지원됐다.',
  '제대군인은 본인부담금 50% 지원을 받았다.',
  '중증 질환에 본인부담금의 50%를 지원했다.',
  '난치성 질환에 본인부담금의 50%를 지원했다.',
  '중증·난치성 질환 조건을 확인하세요. 본인부담금의 50%만 지원됐다.',
  '중증·난치성 질환을 포함한 모든 질환은 본인부담금의 50%를 지원했다.',
  '중증·난치성 질환과 관계없이 본인부담금의 50%를 지원했다.',
  '모든 질환에 본인부담금의 50%를 지원하지만 진료비 전액을 지원한다는 뜻은 아닙니다.',
])('질환 조건을 누락·축소하거나 다른 문장으로 덮으면 보류한다: %s', text => {
  expect(medicalConditionIssue(draft(text), source)).toContain('질환 조건');
});
it.each(['title', 'question', 'audience', 'heading'])('의료 조건 누락은 공개 필드마다 검사한다: %s', field => {
  const changed = draft('중증·난치성 질환에 본인부담금의 50%를 지원했다.');
  const invalid = '인과성이 없으면 본인부담금의 50%를 지원했다.';
  if (field === 'heading') changed.sections[0].heading = invalid;
  else changed[field as 'title' | 'question' | 'audience'] = invalid;
  expect(medicalConditionIssue(changed, source)).toContain('질환 조건');
});
it.each(['.', '\n'])('질환 제한과 비율이 다른 문장이나 줄에 있으면 제한을 추정하지 않는다: %s', separator => {
  const separateSource = `중증 난치성 질환에 한해 안내한다${separator}본인부담금의 50%를 지원한다.`;
  expect(medicalConditionIssue(draft('본인부담금의 50%를 지원한다.'), separateSource)).toBeNull();
});
it.each([
  '복무 중 발생한 중증·난치성 질환에는 본인부담금의 50%만 지원됐다.',
  '중증 및 난치성 질환의 본인 부담금 50%를 지원했다.',
  '중증 질환 또는 난치성 질환에 한해 본인부담금의 50%를 지원했다.',
  '모든 질환의 본인부담금 50%를 지원한다는 뜻은 아닙니다.',
  '이번 발표는 기존 지원 범위와 개선안을 비교한다.',
  '할인 행사에서 50% 할인 혜택을 제공한다.',
])('조건을 보존한 설명과 관련 없는 숫자는 보류하지 않는다: %s', text => {
  expect(medicalConditionIssue(draft(text), source)).toBeNull();
});
it('원문에 질환 제한이 없으면 제한을 새로 만들지 않는다', () => {
  expect(medicalConditionIssue(draft('본인부담금의 50%를 지원한다.'), '본인부담금의 50%를 지원한다.')).toBeNull();
});

const fullSource = '군 복무와 질병의 인과성이 인정돼야 진료비를 전액 지원받았다. ' + source;
it.each([
  '기존에는 인과성이 인정된 질병과 중증·난치성 질환에 본인부담금 일부만 지원됐다.',
  '인과성이 인정된 질병은 의료비 일부를 지원받았다.',
  '군 복무와 인과성이 인정되면 진료비의 50%만 지원됐다.',
])('원문의 전액 지원 조건을 일부 지원으로 바꾸면 보류한다: %s', text => {
  expect(medicalConditionIssue(draft(text), fullSource)).toContain('전액 지원');
});
it.each([
  '인과성이 인정되면 진료비 전액을 지원받았다. 인정되지 않으면 중증·난치성 질환에 본인부담금의 50%를 지원했다.',
  '인과성이 인정된 질병에는 의료비 일부만 지원됐다는 뜻은 아닙니다.',
  '복무 중 발병 또는 상해 여부와 관계없이 전역 이후 지원할 예정이다.',
])('원문 조건 구분과 원문에 있는 범위 설명은 임의로 바꾸지 않는다: %s', text => {
  expect(medicalConditionIssue(draft(text), fullSource)).toBeNull();
});

it('미인정 조건을 섞어도 인정 조건의 전액 지원을 일부로 바꿀 수 없다', () => {
  expect(medicalConditionIssue(draft('인과성이 인정된 질병은 미인정 질병과 함께 의료비 일부만 지원됐다.'), fullSource)).toContain('전액 지원');
});
it('전액 지원을 부정한 원문을 긍정 근거로 추정하지 않는다', () => {
  expect(medicalConditionIssue(draft('인과성이 인정된 질병은 의료비 일부만 지원됐다.'),
    '인과성이 인정돼도 진료비를 전액 지원받지 못했다. ' + source)).toBeNull();
});
it('같은 문장의 인정 전액과 미인정 일부 지원 설명을 구분한다', () => {
  expect(medicalConditionIssue(draft('인과성이 인정되면 진료비 전액 지원을 받고 미인정 중증·난치성 질환에는 본인부담금 50%를 지원했다.'), fullSource)).toBeNull();
});

it('전액 지원한다는 뜻이 아니라는 원문도 긍정 근거로 쓰지 않는다', () => {
  expect(medicalConditionIssue(draft('인과성이 인정된 질병은 의료비 일부만 지원됐다.'),
    '인과성이 인정되면 진료비를 전액 지원한다는 뜻은 아니다. ' + source)).toBeNull();
});
