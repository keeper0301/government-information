import { expect, it } from 'vitest';
import { welfareToDisplay, loanToDisplay } from '@/lib/programs';
it('목록 카드에도 검수되지 않은 기존 해설을 전달하지 않는다', () => {
  const row = { id: '정책', title: '청년 월세', category: '주거', source: '고성군청',
    unique_insight: '근거 없는 제출 서류 안내', household_target_tags: null };
  expect(welfareToDisplay(row as never).uniqueInsight).toBeNull();
  expect(loanToDisplay(row as never).uniqueInsight).toBeNull();
});
