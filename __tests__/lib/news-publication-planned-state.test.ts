import { expect, it } from 'vitest';
import { newsDraftIssue } from '@/lib/news-publication/validation';

// 보호: 명시된 예정 기사와 모든 공개 필드의 시점. 잘못된 허용·보류가 생기면 실패합니다.
// 기존 부제 위치·본문 시험을 경계와 다른 공개 필드로 확장하며 별도 운영 함수는 만들지 않습니다.

const source = '군 복무 청년 정책 개선방안\n내년 7월부터 본격 시행 예정\n정부는 2027년 7월부터 보험을 도입할 예정입니다. 군 복무 청년의 부담을 줄이기 위한 개선방안을 발표했습니다.';
const draft = () => ({ kind: 'change', title: '군 복무 청년 보험 도입 예정과 확인할 기준',
  question: '새로운 보험 안내를 어떻게 읽어야 하나요?', answer: '정부는 군 복무 청년 보험을 도입할 예정입니다. 발표와 실제 시행을 구별하세요.', audience: '군 복무 청년',
  sections: [
    { heading: '발표와 시행 구별', quote: '정책 개선방안', paragraphs: ['새 보험은 시행 예정인 제도입니다. 키피오의 제안: 앞으로 적용할 계획과 현재 이용 중인 제도를 구분해 비교하세요. 이 발표만으로 현재 보험을 이용할 수 있다고 판단하지 마세요.'] },
    { heading: '지원 설명 읽기', quote: '보험을 도입할 예정입니다.', paragraphs: ['정부는 보험을 도입할 예정이라고 발표했습니다. 키피오의 제안: 지원 범위에 대한 발표와 개인의 실제 이용 가능 여부를 나누어 확인하세요. 발표 당시의 예정 상태를 유지해서 읽어야 합니다.'] },
    { heading: '개선 취지와 활용', quote: '개선방안을 발표했습니다.', paragraphs: ['정책 개선방안은 군 복무 청년의 부담을 줄이려는 취지로 발표됐습니다. 키피오의 제안: 개인의 준비 사항은 발표 내용에서 확인한 것만 정리하세요. 원문에 없는 신청 절차와 자격 조건을 만들지 않습니다.'] },
  ],
});

it('제목과 첫 답변의 예정 상태를 보존한 설명은 인정한다', () => {
  expect(newsDraftIssue(draft(), source)).toBeNull();
});
it('키피오가 비교 기준을 제공한다는 자체 해설은 혜택 시행 단정이 아니다', () => {
  const changed = draft();
  changed.sections[1].paragraphs[0] += ' 키피오는 시행 예정인 제도와 기존 실손보험의 비교 기준을 제공합니다.';
  expect(newsDraftIssue(changed, source)).toBeNull();
});
it.each(['제목', '첫 답변'])('다른 문장의 예정 안내로 핵심 예정 상태 누락을 덮지 않는다: %s', field => {
  const changed = draft();
  if (field === '제목') changed.title = '군 복무 청년 보험 도입과 확인할 기준';
  else changed.answer = '군 복무 청년에게 보험을 도입합니다. 시행은 예정된 내용입니다.';
  expect(newsDraftIssue(changed, source)).toContain('제목과 첫 답변에 시행 예정');
});
it.each([
  '이제는 전역 후 보험 지원을 받을 수 있도록 확대되며 의료비 부담을 줄입니다.',
  '현재 군 복무 청년이 보험 지원을 받을 수 있습니다.',
  '군 복무 청년의 보험 지원 확대가 이루어졌다.',
  '군 복무 청년의 보험이 도입됐습니다.',
  '국방부는 군 의무복무 청년 공공 상해보험을 도입합니다.',
  '국가보훈부는 전역군인에게 의료비 지원을 제공합니다.',
  '정부는 청년 정책의 지원 연령을 연장합니다.',
  '군 복무자에 대한 보상과 지원이 강화됩니다.',
  '군 복무 청년 보험 지원이 확대됩니다.',
  '정부는 군 복무 청년의 새로운 보험을 시행합니다.',
  '새 보험은 이미 도입되어 있습니다.',
])('예정된 혜택을 현재 이용이나 완료로 바꾸면 보류한다: %s', text => {
  const changed = draft(); changed.sections[1].paragraphs[0] = text;
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
it('원문에 그대로 있는 기존 제도의 현재 지원 설명은 인정한다', () => {
  const changed = draft(); changed.sections[1].paragraphs[0] += ' 현재 기존 제도는 진료비를 지원한다.';
  expect(newsDraftIssue(changed, source + '\n기존 제도는 진료비를 지원한다.')).toBeNull();
});
it('기존이라는 단어로 원문에 없는 현재 지원을 덮지 않는다', () => {
  const changed = draft(); changed.sections[1].paragraphs[0] += ' 현재 기존 제도는 진료비를 지원한다.';
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
it('기사 앞부분에 전체 시행 예정 안내가 없으면 기존 검사를 유지한다', () => {
  const changed = draft(); changed.title = '군 복무 청년 보험 개선방안 발표';
  expect(newsDraftIssue(changed, source.replace('내년 7월부터 본격 시행 예정\n', ''))).toBeNull();
});
it.each(['현재 보험 지원을 받을 수 있다는 뜻은 아닙니다.', '보험이 도입됐다는 뜻은 아닙니다.'])('현재·완료 단정을 직접 부정한 읽기 안내는 인정한다: %s', text => {
  const changed = draft(); changed.sections[1].paragraphs[0] += ` ${text}`;
  expect(newsDraftIssue(changed, source)).toBeNull();
});
it('현재 혜택 뒤의 다른 조건 부정이나 다음 문장의 예정 안내로 덮지 않는다', () => {
  const changed = draft();
  changed.sections[1].paragraphs[0] = '현재 보험 지원을 받을 수 있으며 별도 가입 의무는 아닙니다. 시행은 예정입니다.';
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
it('같은 문장 뒤의 부정 설명으로 앞의 현재 혜택 단정을 덮지 않는다', () => {
  const changed = draft();
  changed.sections[1].paragraphs[0] = '현재 지원받을 수 있습니다만 이제는 지원받을 수 있다는 뜻은 아닙니다.';
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
it('가입 예정자는 제도의 시행 예정 표시가 아니다', () => {
  const changed = draft(); changed.title = '가입 예정자 보험 안내'; changed.answer = '가입 예정자는 안내를 읽으세요.';
  expect(newsDraftIssue(changed, source)).toContain('제목과 첫 답변에 시행 예정');
});
it.each(['현재 지원받을 수 있나요?', '현재 지원받을 수 있지 않습니다.'])('질문이나 바로 붙은 부정을 확정 단정으로 읽지 않는다: %s', text => {
  const changed = draft(); changed.sections[1].paragraphs[0] += ` ${text}`;
  expect(newsDraftIssue(changed, source)).toBeNull();
});
it('현재 시행 중이 아니라는 직접 부정은 인정한다', () => {
  const changed = draft(); changed.sections[1].paragraphs[0] += ' 현재 시행 중이 아닙니다.';
  expect(newsDraftIssue(changed, source)).toBeNull();
});
it('시행 중이 아니라는 설명 뒤의 실제 시행 단정은 보류한다', () => {
  const changed = draft(); changed.sections[1].paragraphs[0] = '현재 시행 중이 아닙니다만 이미 시행 중입니다.';
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
it.each([['2027년 7월부터 도입 예정', 2, true], ['내년 7월부터 본격 시행 예정', 3, true],
  ['내년 7월부터 본격 시행 예정', 4, false]])('명시된 예정 부제의 앞 세 줄 경계를 지킨다: %s / %s', (header, line, held) => {
  const changed = draft(); changed.title = '군 복무 청년 보험 개선방안 발표';
  const body = [...Array(Number(line) - 1).fill('군 복무 청년 정책 개선방안'), String(header),
    source.split('\n').slice(2).join('\n')].join('\n');
  const issue = newsDraftIssue(changed, body);
  if (held) expect(issue).toContain('제목과 첫 답변에 시행 예정');
  else expect(issue).toBeNull();
});
it.each(['질문', '대상', '소제목'])('본문 외 공개 필드의 현재 단정도 보류한다: %s', field => {
  const changed = draft(); const current = '현재 군 복무 청년에게 보험을 지원합니다.';
  if (field === '질문') changed.question = current;
  else if (field === '대상') changed.audience = current;
  else changed.sections[1].heading = current;
  expect(newsDraftIssue(changed, source)).toContain('현재 시행·완료');
});
