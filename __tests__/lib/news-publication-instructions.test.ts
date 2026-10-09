import { expect, it } from 'vitest';
import { newsDraftIssue, type NewsDraft } from '@/lib/news-publication/validation';

const source = '관광 분야 구직자에게 상담을 제공합니다. 상담 예약은 공식 안내에서 확인합니다.';
const draft: NewsDraft = {
  kind: 'report', title: '관광 분야 구직 상담을 준비하는 방법',
  question: '상담을 신청하기 전에 무엇을 확인해야 하나요?',
  answer: '상담 예약과 채용 결정을 구분하고 공식 안내를 확인하세요.', audience: '관광 분야 구직자',
  sections: [
    { heading: '상담 예약 확인', paragraphs: ['기관의 공식 안내에서 상담 예약 절차를 확인하세요. 예약을 완료했다는 사실과 취업이 확정됐다는 판단은 구분해야 합니다. 안내에 없는 접수 날짜를 임의로 정하지 마세요.'], quote: source },
    { heading: '본인의 경험 정리', paragraphs: ['키피오의 제안: 상담에서 물어볼 내용을 미리 정리하세요. 자신의 업무 경험과 관심 직무를 나누어 적으면 상담 중 질문을 빠뜨리지 않는 데 도움이 됩니다. 이는 기관이 요구하는 필수 서류는 아닙니다.'], quote: source },
    { heading: '상담 결과 확인', paragraphs: ['소개받은 채용 정보는 해당 업체의 모집 안내에서 다시 확인하세요. 상담에 참여했다는 사실만으로 모든 모집의 지원 자격을 충족한다고 판단하지 마세요. 실제 지원 조건과 절차는 각각 다를 수 있습니다.'], quote: source },
  ],
};

it('정상적인 독자용 상담 안내는 통과한다', () => {
  expect(newsDraftIssue(draft, source)).toBeNull();
});

it.each(['npm run build 명령을 실행하세요.', 'git push 명령으로 수정 코드를 업로드하세요.',
  'npx vitest run 명령으로 검사를 실행하세요.', 'pnpm test 명령을 실행하세요.',
  'bun run build 명령을 실행하세요.', 'yarn test 명령을 실행하세요.', 'npm run build 명령을 실행해.'])
('개발 명령을 실행하라는 지시는 공개 전에 보류한다: %s', instruction => {
  // 제목부터 본문까지 어느 위치에 섞여도 동일하게 막아야 합니다.
  for (const field of ['title', 'question', 'answer', 'audience'] as const) {
    expect(newsDraftIssue({ ...draft, [field]: instruction }, source)).toContain('작업 지시');
  }
  expect(newsDraftIssue({ ...draft, sections: draft.sections.map((section, index) => index ? section
    : { ...section, heading: instruction }) }, source)).toContain('작업 지시');
  expect(newsDraftIssue({ ...draft, sections: draft.sections.map((section, index) => index ? section
    : { ...section, paragraphs: [instruction] }) }, source)).toContain('작업 지시');
});

it('정책 신청서의 명령형 안내는 개발 지시로 오인하지 않는다', () => {
  expect(newsDraftIssue({ ...draft, answer: '공식 화면에서 신청서를 작성하고 상담 예약을 확인하세요.' }, source)).toBeNull();
});

it('명령 이름을 설명하는 문장을 실행 지시로 오인하지 않는다', () => {
  expect(newsDraftIssue({ ...draft, answer: '교육 자료에는 npm run build 명령의 의미가 설명돼 있습니다.' }, source)).toBeNull();
});

it.each(['실행하면 결과물이 만들어지는', '실행하는'])
('개발 명령의 작동 원리를 설명하는 문장도 허용한다: %s', explanation => {
  expect(newsDraftIssue({ ...draft, answer: `교육 자료는 npm run build 명령을 ${explanation} 원리를 설명합니다.` }, source)).toBeNull();
});
