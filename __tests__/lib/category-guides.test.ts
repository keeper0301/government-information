import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/policy-guides', () => ({ getGuides: mock.get }));
import { loadCategoryGuides } from '@/lib/category-guides';
beforeEach(() => { mock.get.mockReset(); });
it('정상 조회는 검수된 가이드를 유지하고 전체 조회에 제한 시간을 전달한다', async () => {
  const guides = [{ slug: '확인된-가이드' }];
  mock.get.mockResolvedValue(guides);
  expect(await loadCategoryGuides('youth')).toEqual({ guides, unavailable: false });
  expect(mock.get.mock.calls[0][1]).toMatchObject({ publicationOnly: true, categorySlugs: ['youth'] });
  expect(mock.get.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it('저장소 조회 실패 시 옛 승인 글이나 부분 목록 대신 조회 불가 상태를 반환한다', async () => {
  mock.get.mockRejectedValue(new Error('Guide data temporarily unavailable', { cause: { status: 522, code: '' } }));
  expect(await loadCategoryGuides('youth')).toEqual({ guides: [], unavailable: true });
});
it.each([{ status: 401 }, { status: 403 }, { status: 500, code: 'PGRST204' }])('설정·권한 오류는 숨기지 않는다: %j', async cause => {
  mock.get.mockRejectedValue(new Error('Guide data temporarily unavailable', { cause }));
  await expect(loadCategoryGuides('youth')).rejects.toThrow('Guide data temporarily unavailable');
});
it('조회 제한 시간이 지난 요청은 중단하고 조회 불가로 표시한다', async () => {
  mock.get.mockRejectedValue(new Error('Guide data temporarily unavailable', { cause: { status: 0, code: '', details: 'TimeoutError' } }));
  expect(await loadCategoryGuides('youth')).toEqual({ guides: [], unavailable: true });
});
it('본문 오류나 프로그래밍 오류는 일시적인 조회 실패로 숨기지 않는다', async () => {
  mock.get.mockRejectedValue(new Error('Invalid policy guide content'));
  await expect(loadCategoryGuides('youth')).rejects.toThrow('Invalid policy guide content');
});
