import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), generate: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mock.rpc }) }));
vi.mock('@/lib/news-publication/source', () => ({ readOfficialNews: mock.read }));
vi.mock('@/lib/news-publication/generate', () => ({ generateVerifiedNews: mock.generate }));
import { runNewsPublication } from '@/lib/news-publication/run';
import { NewsDraftError } from '@/lib/news-publication/errors';

const row = { id: '후보', source_id: '148972915', title: '군 복무 청년 지원',
  source_url: 'https://www.korea.kr/news/customizedNewsView.do?newsId=148972915',
  published_at: '2026-10-06T00:00:00Z', updated_at: null, ministry: '담당 기관', benefit_tags: ['의료'], lease_token: '예약번호' };
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '검사용설정');
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-type': 'image/webp' } })));
  mock.read.mockResolvedValue({ title: row.title, url: row.source_url, body: '검증할 원문', hash: '같은본문', publishedAt: '2026-10-06' });
  mock.generate.mockResolvedValue({ kind: 'change', title: '전역 후 청년 보험 지원 변경', editorialReview: { scope: { passed: true } }, contentDepth: { missingFacts: [], sections: [] }, question: '질문', answer: '설명', audience: '군 복무 청년', sections: [{ heading: '확인', paragraphs: ['해설'], quote: '근거' }] });
  let claimed = false;
  mock.rpc.mockImplementation(async (name) => name === 'claim_editorial_news_with_status'
    ? { data: claimed ? null : (claimed = true, row), error: null } : { data: true, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('후보가 없을 때 예약 잠금 안에서 반환된 종료 이유를 보존한다', async () => {
  mock.rpc.mockResolvedValueOnce({ data: { stopReason: 'daily_limit' }, error: null });
  expect(await runNewsPublication()).toMatchObject({ attempted: 0, published: 0, stopReason: 'daily_limit' });
  expect(mock.generate).not.toHaveBeenCalled();
});
it('한 편 공개 후 다음 예약이 실패해도 공개 건수와 주소를 보존한다', async () => {
  mock.rpc.mockResolvedValueOnce({ data: row }).mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { message: '비공개 내부 오류' } });
  expect(await runNewsPublication()).toMatchObject({ published: 1, stopReason: 'failed', slugs: [`policy-brief-${row.source_id}`] });
});
it('검사 뒤 원문 변경으로 보류돼도 완료된 검수 근거를 보존한다', async () => {
  const reviewAudit = { version: '검사용', status: 'passed', events: [{ attempt: 1, stage: 'contentDepth', status: 'passed' }] };
  mock.generate.mockResolvedValueOnce({ reviewAudit, sections: [], editorialReview: {}, contentDepth: {} });
  mock.read.mockResolvedValueOnce({ title: row.title, hash: '처음', publishedAt: '2026-10-06' })
    .mockResolvedValueOnce({ title: row.title, hash: '바뀜', publishedAt: '2026-10-06' });
  expect(await runNewsPublication()).toMatchObject({ held: 1, published: 0 });
  const saved = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(saved.p_evidence.reviewAudit).toEqual(reviewAudit);
  expect(saved.p_reason).toContain('원문이 변경');
  expect(saved.p_article).toBeNull();
});
it('100초를 사용했으면 다음 후보를 예약하지 않고 현재 결과를 돌려준다', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(100000);
  try {
    expect(await runNewsPublication()).toMatchObject({ attempted: 1, published: 1 });
    expect(mock.rpc.mock.calls.filter(([name]) => name === 'claim_editorial_news_with_status')).toHaveLength(1);
  } finally { clock.mockRestore(); }
});
it('작성 도구 설정이 없으면 후보 예약 전에 멈춰 하루 한도를 소비하지 않는다', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  await expect(runNewsPublication()).rejects.toThrow('설정이 없습니다');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('원문을 두 번 읽고 같은 경우에만 자동 확인 표시와 함께 공개한다', async () => {
  const original = await mock.generate();
  mock.generate.mockResolvedValue({ ...original, reviewAudit: { version: '검사용', status: 'passed', events: [] } });
  expect(await runNewsPublication()).toMatchObject({ published: 1, held: 0 });
  expect(mock.read).toHaveBeenCalledTimes(2);
  const saved = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(saved.p_article.title).toBe('전역 후 청년 보험 지원 변경');
  expect(saved.p_evidence.editorialReview.scope.passed).toBe(true);
  expect(saved.p_evidence.contentDepth).toEqual({ missingFacts: [], sections: [] });
  expect(saved.p_article).not.toHaveProperty("contentDepth");
  expect(saved.p_article).not.toHaveProperty('reviewAudit');
  expect(saved.p_evidence.reviewAudit.version).toBe('검사용');
  expect(saved.p_evidence.photoReview).toMatchObject({
    status: 'passed', url: expect.stringMatching(/^\/images\/news\/.+\.webp$/),
    sourceUrl: expect.stringMatching(/^https:\/\//), licenseUrl: expect.stringMatching(/^https:\/\//),
  });
  expect(saved.p_article.automaticPublication.sourceHash).toBe('같은본문');
  expect(saved.p_article.classification.regions).toEqual(['unclassified']);
  expect(saved.p_evidence.sections[0].quote).toBe('근거');
});
it('원문이 바뀌거나 날짜가 다르면 공개하지 않는다', async () => {
  mock.read.mockResolvedValueOnce({ title: row.title, hash: '옛본문', publishedAt: '2026-10-06' });
  expect(await runNewsPublication()).toMatchObject({ published: 0, held: 1 });
  mock.read.mockResolvedValue({ title: row.title, hash: '같은본문', publishedAt: '2026-10-05' });
  mock.rpc.mockResolvedValueOnce({ data: row }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: null });
  expect(await runNewsPublication()).toMatchObject({ published: 0, held: 1 });
});
it('주소가 있는 원문 근거는 비공개 자료에만 저장하고 공개 글에서 제외한다', async () => {
  const quote = '공식 안내 https://example.go.kr/apply 에서 참여 방법을 확인합니다.';
  mock.generate.mockResolvedValueOnce({ kind: 'application', title: '한복문화주간 참여 방법 안내', question: '어떻게 참여하나요?',
    answer: '공식 참여 방법을 확인하세요.', audience: '참여를 준비하는 청년',
    sections: [{ heading: '참여 방법 확인', paragraphs: ['기관의 참여 안내를 확인합니다.'], quote }] });
  expect(await runNewsPublication()).toMatchObject({ published: 1, held: 0 });
  const saved = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(saved.p_evidence.sections[0].quote).toBe(quote);
  expect(saved.p_article.sections).toEqual([{ heading: '참여 방법 확인', paragraphs: ['기관의 참여 안내를 확인합니다.'] }]);
  expect(JSON.stringify(saved.p_article)).not.toContain('example.go.kr');
  expect(mock.read.mock.calls.every(([url]) => url === row.source_url)).toBe(true);
});
it('사진 없는 신규 주제는 공개하지 않고 기존 검수와 사진 보류 근거를 남긴다', async () => {
  const original = await mock.generate();
  mock.generate.mockResolvedValue({ ...original, title: '새 행정 체계 개편 안내' });
  expect(await runNewsPublication()).toMatchObject({ published: 0, held: 1 });
  const saved = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(saved.p_article).toBeNull();
  expect(saved.p_evidence.editorialReview.scope.passed).toBe(true);
  expect(saved.p_evidence.photoReview.status).toBe('held');
  expect(saved.p_reason).toContain('자료사진');
});
it('한 후보가 실패해도 다음 후보를 처리하며 저장 충돌을 발행으로 세지 않는다', async () => {
  mock.generate.mockRejectedValueOnce(new Error('근거 불충분'));
  let count = 0;
  mock.rpc.mockImplementation(async (name) => name === 'claim_editorial_news_with_status'
    ? { data: count++ < 2 ? row : null } : { data: count === 1 });
  expect(await runNewsPublication()).toMatchObject({ attempted: 2, held: 1, published: 0, conflicts: 1 });
});
it('예약할 자료가 없으면 작성 도구를 부르지 않는다', async () => {
  mock.rpc.mockResolvedValue({ data: null });
  expect(await runNewsPublication()).toMatchObject({ attempted: 0, published: 0 });
  expect(mock.generate).not.toHaveBeenCalled();
});
it('수집 태그와 전국 순위 표현을 공개 분류에 복사하지 않는다', async () => {
  mock.generate.mockResolvedValueOnce({ title: '부산 동래온천, 전국 네 번째 온천도시', sections: [] });
  await runNewsPublication();
  const saved = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(saved.p_article.classification).toEqual({ benefits: ['문화'], regions: ['busan'] });
});

it('검사에 걸린 실제 초안과 이유는 비공개 저장소에만 남긴다', async () => {
  mock.generate.mockRejectedValueOnce(new NewsDraftError('설명 분량이 기준 밖입니다: 400자.', { draft: { answer: '공개하면 안 되는 초안' } }));
  expect(await runNewsPublication()).toMatchObject({ published: 0, held: 1, slugs: [] });
  const held = mock.rpc.mock.calls.find(call => call[0] === 'finish_editorial_news')![1];
  expect(held.p_article).toBeNull();
  expect(held.p_reason).toContain('400자');
  expect(held.p_evidence.draft.answer).toBe('공개하면 안 되는 초안');
});
