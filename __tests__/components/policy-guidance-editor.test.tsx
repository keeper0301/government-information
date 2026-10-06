import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
let root: Root; let container: HTMLDivElement;
const button = (name: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent === name)!;
async function click(item: HTMLElement) { await act(async () => { item.click(); }); }
import { PolicyGuidanceEditor } from '@/components/admin/PolicyGuidanceEditor';

afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); vi.unstubAllGlobals(); });
it('목록 선택부터 초안 저장·승인·회수까지 연결하고 미저장 변경의 승인을 막는다', async () => {
  const sections = ['대상 조건 확인 순서', '공고상 주의점', '서류와 제출 순서']
    .map(label => ({ label, text: '조건 설명', quote: '원문 근거 문장' }));
  const guide = { status: 'draft', sections, source: { body: '원문 근거 문장' }, contentSnapshot: '현재초안', programSnapshot: '정책값' };
  const row = { id: '정책번호', title: '경남 지원사업', source_url: 'https://www.gyeongnam.go.kr/notice?id=1',
    description: '지원 내용', policy_guidance: guide };
  const actions: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: { body?: string }) => {
    let result;
    if (url.includes('/queue?')) result = { items: [row], total: 1 };
    else if (!options?.body) result = { program: row, snapshot: '정책값' };
    else {
      const body = JSON.parse(options.body); actions.push(body.action);
      result = { guidance: { ...guide, sections: body.sections,
        status: body.action === 'approve' ? 'approved' : 'draft' } };
    }
    return { ok: true, json: async () => result };
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<PolicyGuidanceEditor />); });
  await click(button(row.title));
  const approve = button('저장한 초안 검수 승인');
  expect(approve.hasAttribute('disabled')).toBe(true);
  const textarea = container.querySelectorAll('textarea')[1];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '새 설명');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(container.querySelector('input[type="checkbox"]')!);
  expect(approve.hasAttribute('disabled')).toBe(true);
  await click(button('수정한 초안 저장'));
  expect(actions).toEqual(['draft']);
  expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  await click(container.querySelector('input[type="checkbox"]')!);
  await click(button('저장한 초안 검수 승인'));
  await click(button('검수 승인 회수'));
  expect(button('저장한 초안 검수 승인')).toBeTruthy();
  expect(actions).toEqual(['draft', 'approve', 'revoke']);
});
