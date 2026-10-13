import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: vi.fn(), query: vi.fn(), rpc: vi.fn(), error: null as unknown }));
vi.mock('@/lib/admin-auth-server', () => ({ requireAdminUser: state.user }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: state.query, rpc: state.rpc }) }));
import { GET } from '@/app/api/admin/policy-guidance/queue/route';
beforeEach(() => {
  state.user.mockResolvedValue({ id: '운영자' }); state.query.mockClear(); state.error = null;
  const chain = { select: () => chain, ilike: () => chain, or: () => chain, order: () => chain,
    range: () => chain, abortSignal: async () => ({ data: [{ id: '자료', title: '지원' }], count: 1, error: state.error }) };
  state.query.mockReturnValue(chain);
  state.rpc.mockReset().mockReturnValue({ abortSignal: async () => ({
    data: { items: [{ id: '점검자료', title: '주소 확인 필요' }], total: 21, page: 1 }, error: state.error,
  }) });
});
it('로그인 전 대기 자료를 노출하지 않는다', async () => {
  state.user.mockResolvedValue(null);
  expect((await GET(new Request('https://keepioo.com/api/admin/policy-guidance/queue'))).status).toBe(401);
  expect(state.query).not.toHaveBeenCalled();
});
it('잘못된 페이지와 정책 종류를 거절한다', async () => {
  for (const query of ['page=-1', 'page=0.5', 'type=secret']) {
    expect((await GET(new Request(`https://keepioo.com/api/admin/policy-guidance/queue?${query}`))).status).toBe(400);
  }
  expect(state.query).not.toHaveBeenCalled();
});
it('자료 목록은 관리자 전용 응답으로 제공한다', async () => {
  const response = await GET(new Request('https://keepioo.com/api/admin/policy-guidance/queue?type=loan'));
  expect(response.status).toBe(200); expect(state.query).toHaveBeenCalledWith('loan_programs');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('조회 실패를 빈 목록으로 숨기지 않는다', async () => {
  state.error = { message: '저장소 오류' };
  expect((await GET(new Request('https://keepioo.com/api/admin/policy-guidance/queue'))).status).toBe(503);
});

// 주소 점검 두 종류는 일반 목록과 다른 저장 함수를 사용하므로 각각 보호한다.
it.each([
  ['source', 'welfare', 'welfare_programs'],
  ['application', 'loan', 'loan_programs'],
])('%s 점검 목록의 조건과 관리자 전용 응답을 유지한다', async (issue, type, table) => {
  const params = new URLSearchParams({ issue, type, page: '1', search: ' 청년 ' });
  const response = await GET(new Request(`https://keepioo.com/api/admin/policy-guidance/queue?${params}`));
  expect(response.status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith('policy_guidance_issue_queue', {
    target_table: table, issue_kind: issue, search_text: '청년', page_number: 1,
  });
  expect(state.query).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({ items: [{ id: '점검자료', title: '주소 확인 필요' }], total: 21, page: 1 });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});

it.each(['source', 'application'])('%s 점검 함수 오류를 빈 결과로 숨기지 않는다', async issue => {
  state.error = { message: '저장 함수 오류' };
  const response = await GET(new Request(`https://keepioo.com/api/admin/policy-guidance/queue?issue=${issue}`));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: '주소 점검 목록의 준비 상태를 확인하세요.' });
  expect(state.query).not.toHaveBeenCalled();
});
