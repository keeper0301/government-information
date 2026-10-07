import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), read: vi.fn(), generate: vi.fn() }));
vi.mock('@/lib/admin-auth-server', () => ({ requireAdminUser: mocks.authorize }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/news-publication/source', () => ({ readOfficialNews: mocks.read }));
vi.mock('@/lib/news-publication/generate', () => ({ generateVerifiedNews: mocks.generate }));
import { previewNewsDraft } from '@/app/admin/news/preview/actions';
import { NewsDraftError } from '@/lib/news-publication/errors';

const source = { title: '군 복무 청년 보험 지원', url: 'https://www.korea.kr/news/customizedNewsView.do?newsId=148972915',
  body: '공식 원문', hash: '원문확인값', publishedAt: '2026-10-06' };
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> };
async function run(sourceId = '148972915') {
  const form = new FormData(); form.set('sourceId', sourceId);
  return previewNewsDraft({ status: 'idle', message: '' }, form);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ id: '관리자' });
  query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: {
    title: source.title, source_url: source.url, published_at: '2026-10-06T00:00:00Z' }, error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query); mocks.read.mockResolvedValue(source);
  mocks.generate.mockResolvedValue({ title: '비공개 검사 초안' });
});
afterEach(() => vi.restoreAllMocks());
it('관리자가 아니면 저장소와 작성 도구에 접근하지 않는다', async () => {
  mocks.authorize.mockResolvedValue(null);
  expect(await run()).toMatchObject({ status: 'error', message: '관리자 로그인이 필요합니다.' });
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
});
it('주소와 잘못된 번호는 원문을 요청하기 전에 차단한다', async () => {
  expect(await run('https://외부주소')).toMatchObject({ status: 'error' });
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it('통과한 초안은 반환만 하며 공개 저장이나 예약 변경을 하지 않는다', async () => {
  const result = await run();
  expect(result).toMatchObject({ status: 'passed', source });
  expect(JSON.parse(result.evidenceText!)).toEqual({ title: '비공개 검사 초안' });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('news_posts');
  expect(query.eq).toHaveBeenCalledWith('source_id', '148972915');
  expect(query.eq).toHaveBeenCalledWith('is_hidden', false);
  expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(source);
});
it('보류된 초안과 대조 결과도 관리자에게만 반환한다', async () => {
  mocks.generate.mockRejectedValue(new NewsDraftError('별도 사실 대조에서 보류됐습니다.', { draft: { title: '검사 초안' }, judgment: { supported: false } }));
  const result = await run(); expect(result.status).toBe('held');
  expect(JSON.parse(result.evidenceText!).judgment.supported).toBe(false);
});
it('수집 날짜가 다르거나 기사가 없으면 작성 도구를 부르지 않는다', async () => {
  mocks.read.mockResolvedValue({ ...source, publishedAt: '2026-10-05' });
  expect(await run()).toMatchObject({ status: 'error' });
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await run()).toMatchObject({ status: 'error' });
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('수집 번호와 다른 공식 주소는 원문을 읽기 전에 차단한다', async () => {
  query.maybeSingle.mockResolvedValue({ data: { title: source.title,
    source_url: source.url.replace('148972915', '148972917'), published_at: '2026-10-06T00:00:00Z' }, error: null });
  expect(await run()).toMatchObject({ status: 'error', message: '수집 번호와 공식 기사 번호가 다릅니다.' });
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
});
it('외부 도구의 원래 오류에 있는 인증 정보는 결과에 포함하지 않는다', async () => {
  mocks.generate.mockRejectedValue(new Error('외부 오류: 검사용-비밀값'));
  const result = await run(); expect(result.status).toBe('error');
  expect(JSON.stringify(result)).not.toContain('검사용-비밀값');
});
it.each([
  ['원문', new Error('접속 실패: 검사용-비밀값'), '공식 원문 읽기 단계에서 호출에 실패했습니다.'],
  ['작성', new Error('OpenAI 응답 타임아웃 (25000ms)'), '초안 작성·검사 단계에서 응답 대기 시간이 초과됐습니다.'],
  ['작성', new Error('OpenAI API 오류 401: 검사용-비밀값'), '초안 작성·검사 단계에서 작성 도구 인증을 확인해야 합니다.'],
  ['작성', new Error('OpenAI API 오류 429: 검사용-비밀값'), '초안 작성·검사 단계에서 작성 도구 사용 한도에 도달했습니다.'],
  ['작성', new Error('OpenAI API 오류 503: 검사용-비밀값'), '초안 작성·검사 단계에서 작성 도구 서버가 응답하지 못했습니다.'],
  ['작성', new Error('JSON 파싱 실패: 검사용-비밀값'), '초안 작성·검사 단계에서 작성 결과 형식을 읽지 못했습니다.'],
])('실패 단계와 종류만 알리고 비밀값은 화면과 기록에 남기지 않는다: %s', async (stage, error, message) => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  if (stage === '원문') mocks.read.mockRejectedValue(error);
  else mocks.generate.mockRejectedValue(error);
  const result = await run();
  expect(result).toEqual({ status: 'error', message: `${message} 공개하지 않았습니다.` });
  expect(warning).toHaveBeenCalledExactlyOnceWith('정책뉴스 비공개 검사 실패', { stage: stage === '원문' ? '공식 원문 읽기' : '초안 작성·검사', reason: message.split(' 단계에서 ')[1] });
  expect(JSON.stringify([result, warning.mock.calls])).not.toContain('검사용-비밀값');
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('news_posts');
  if (stage === '원문') expect(mocks.generate).not.toHaveBeenCalled();
});
