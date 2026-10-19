import { expect, it } from 'vitest';
import { withNewsReviewAudit, type ReviewEvent } from '@/lib/news-publication/audit';
import { NewsDraftError } from '@/lib/news-publication/errors';
import { countNotationIssue } from '@/lib/news-publication/count-notation';

it('실제 통과한 단계와 재작성 이력을 분리해 보존한다', async () => {
  const result = await withNewsReviewAudit(async audit => {
    audit.nextAttempt(); audit.start('draft'); audit.sourceState(null); audit.hold('draft', '숫자 오류');
    audit.nextAttempt(); audit.start('draft'); audit.sourceState(null); audit.pass('draft');
    return { title: '검사 대상' };
  });
  expect(result.reviewAudit.status).toBe('passed');
  expect(result.reviewAudit.events).toContainEqual({ attempt: 1, stage: 'draft', status: 'held', reason: '숫자 오류' });
  expect(result.reviewAudit.events).toContainEqual({ attempt: 2, stage: 'sourceState', status: 'passed' });
});
it('이전 단계 실패를 상태 검사 통과로 기록하지 않는다', async () => {
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt(); audit.start('draft'); throw new NewsDraftError('형식 오류', { draft: { title: '보존' } });
  }).catch(error => error);
  expect(error.evidence.draft.title).toBe('보존');
  expect(error.evidence.reviewAudit.events.some((event: ReviewEvent) => event.stage === 'sourceState')).toBe(false);
});
it('도구의 원시 오류는 저장하지 않는다', async () => {
  const error = await withNewsReviewAudit(async () => { throw new Error('비밀이 든 오류'); }).catch(error => error);
  expect(JSON.stringify(error.evidence)).not.toContain('비밀');
});
it.each(['4만 7천 건', '4만 건 이상', '47000건'])('건수 축약·조건 변경 %s를 날짜 수정으로 오인하지 않는다', text => {
  expect(countNotationIssue(text, '지난 7일까지 4만 7000여 건 중 4만여 건')).toContain('건수 표기');
});
it('원문 건수의 띄어쓰기와 쉼표만 다른 경우 허용한다', () => {
  expect(countNotationIssue('4만7000여건과 9만 건, 1,000건', '4만 7000여 건, 9만 건, 1000건')).toBeNull();
});
it.each([['20건', '10~20건'], ['20건', '10건~20건'], ['20건', '10건-20건'], ['20건', '10-20건'], ['10건', '최대 10건'], ['10건', '최소 10건'], ['10건', '10건가량'], ['5000건', '1억5000건'], ['5만건', '1.5만건']])('원문의 범위·대략·큰 단위를 삭제한 %s를 보류한다', (draft, source) => {
  expect(countNotationIssue(draft, source)).not.toBeNull();
});
