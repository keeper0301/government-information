import { expect, it, vi } from 'vitest';
import { approveGuide, createGuideDraft, getPublishedGuide, publicGuidance } from '@/lib/policy/evidence-guide';
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
import { savePrivateReview } from '@/lib/policy/guidance-storage';
const row = { id: '정책번호', updated_at: '2026-10-06', title: '주거 지원',
  source_url: 'https://www.gwgs.go.kr/notice?id=1', policy_guidance: null };
const draft = createGuideDraft(row, { url: row.source_url, title: row.title,
  body: '지원 대상은 지역 거주 청년입니다. 이 뒤의 전체 원문은 공개 설명에 필요하지 않습니다.',
  checkedAt: '2026-10-06T00:00:00Z' },
[{ label: '대상', text: '지역 거주 여부를 확인하세요.', quote: '지역 거주 청년' }]);
it('초안의 내용과 원문은 공개 저장 칸에 담지 않는다', () => {
  expect(publicGuidance(row, draft)).toEqual({ version: 1, status: 'draft' });
});
it('승인본은 인용문만 공개하고 실제 검수자 번호를 공개하지 않는다', () => {
  const approved = approveGuide(row, draft, '관리자개인번호', new Date('2026-10-06T01:00:00Z'));
  const published = publicGuidance(row, approved);
  expect(JSON.stringify(published)).not.toContain('관리자개인번호');
  expect(JSON.stringify(published)).not.toContain('이 뒤의 전체 원문');
  expect(getPublishedGuide(row, published)?.sections).toEqual(draft.sections);
});
it('비공개 초안과 안전한 공개본을 이전 정책·검수번호 대조와 함께 저장한다', async () => {
  const signal = vi.fn().mockResolvedValue({ data: true, error: null });
  const rpc = vi.fn(() => ({ abortSignal: signal }));
  expect(await savePrivateReview({ rpc } as never, 'welfare_programs', row,
    { revision: '이전검수번호', guidance: null }, draft)).toBe(true);
  expect(rpc).toHaveBeenCalledWith('save_policy_guidance_review', expect.objectContaining({
    expected_revision: '이전검수번호', expected_public: null,
    private_guidance: draft, published_guidance: { version: 1, status: 'draft' },
  }));
});
