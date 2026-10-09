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
