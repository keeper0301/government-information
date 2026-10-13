import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuideDraft, programSnapshot } from '@/lib/policy/evidence-guide';
const mocks = vi.hoisted(() => ({ user: vi.fn(), row: null as Record<string, unknown> | null,
  save: vi.fn(), rpc: vi.fn(), refreshed: vi.fn(), saveRows: [{ id: 'saved' }] as unknown[], error: null as unknown }));
vi.mock('@/lib/admin-auth-server', () => ({ requireAdminUser: mocks.user }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refreshed }));
vi.mock('@/lib/policy/guidance-storage', () => ({
  readPrivateReview: async () => ({ guidance: mocks.row?.policy_guidance, revision: '현재검수' }),
  savePrivateReview: async (_admin: unknown, _table: unknown, _row: unknown, _review: unknown, guidance: unknown) => {
    mocks.save({ policy_guidance: guidance }); return mocks.saveRows.length > 0;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: mocks.error }) }) }),
  update: (patch: unknown) => {
    mocks.save(patch);
    const chain = { eq: () => chain, is: () => chain, filter: () => chain,
      select: async () => ({ data: mocks.saveRows, error: null }) };
    return chain;
  },
}) }) }));
import { POST } from '@/app/api/admin/policy-guidance/route';
const id = '3c0550cc-381c-4d84-81bd-a307394cccc3';
function request(extra: Record<string, unknown> = {}) {
  return new Request('https://www.keepioo.com/api/admin/policy-guidance', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, type: 'welfare',
      snapshot: mocks.row ? programSnapshot(mocks.row as never) : '', action: 'approve',
      contentSnapshot: (mocks.row?.policy_guidance as { contentSnapshot?: string })?.contentSnapshot,
      sourceChecked: true, ...extra }) });
}
describe('관리자 원문 검수와 변경 충돌 방어', () => {
  beforeEach(() => {
    mocks.user.mockResolvedValue({ id: '운영자' }); mocks.save.mockClear(); mocks.refreshed.mockClear();
    mocks.saveRows = [{ id }]; mocks.error = null;
    mocks.rpc.mockReset(); mocks.rpc.mockReturnValue({ abortSignal: async () => ({ data: true, error: null }) });
    const row = { id, title: '청년 월세', source_url: 'https://www.gwgs.go.kr/notice?id=123',
      description: '고성군 거주 청년 대상', updated_at: '2026-10-06' };
    mocks.row = { ...row, policy_guidance: createGuideDraft(row, { url: row.source_url, title: row.title,
      body: '신청 대상은 고성군 거주 청년입니다.', checkedAt: null },
    [{ label: '대상 확인', text: '거주 조건부터 확인하세요.', quote: '고성군 거주 청년' }]) };
  });
  it('로그인하지 않으면 저장할 수 없다', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('원문을 대조했다고 확인하지 않으면 승인할 수 없다', async () => {
    expect((await POST(request({ sourceChecked: false }))).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('이전 정책 정보로 현재 초안을 승인할 수 없다', async () => {
    expect((await POST(request({ snapshot: '오래된 정보' }))).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('초안 내용이 변경 감지 값과 다르면 승인할 수 없다', async () => {
    const guide = mocks.row!.policy_guidance as { sections: { text: string }[] };
    guide.sections[0].text = '변조된 설명';
    expect((await POST(request())).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('검수 승인 후 해당 상세 화면만 갱신한다', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      policy_guidance: expect.objectContaining({ status: 'approved', reviewerId: '운영자' }) }));
    expect(mocks.refreshed).toHaveBeenCalledWith(`/welfare/${id}`);
  });
  it('다른 작업이 먼저 저장했다면 충돌로 보고한다', async () => {
    mocks.saveRows = [];
    expect((await POST(request())).status).toBe(409); expect(mocks.refreshed).not.toHaveBeenCalled();
  });
  it('저장하지 않은 주소로 대조한 초안의 승인을 거절한다', async () => {
    expect((await POST(request({ sourceUrl: 'https://www.gwgs.go.kr/notice?id=456' }))).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('주소 교정은 이전 검수와 공개 상태를 함께 확인한다', async () => {
    const response = await POST(request({ action: 'source', sourceUrl: 'https://www.gwgs.go.kr/notice?id=456' }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('replace_policy_guidance_link', expect.objectContaining({
      target_table: 'welfare_programs', target_id: id, expected_revision: '현재검수', link_kind: 'source' }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('주소 교정 충돌은 기존 자료를 덮어쓰지 않는다', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: async () => ({ data: false, error: null }) });
    expect((await POST(request({ action: 'source', sourceUrl: 'https://www.gwgs.go.kr/notice?id=456' }))).status).toBe(409);
  });
});
