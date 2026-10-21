import { afterEach, expect, it, vi } from 'vitest';
import { callLLM, parseJSONResponse } from '@/lib/llm/text';
import { withNewsReviewAudit } from '@/lib/news-publication/audit';
import { NewsDraftError } from '@/lib/news-publication/errors';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  [400, 'request_rejected'], [401, 'authentication'], [403, 'permission'], [408, 'timeout'],
  [429, 'rate_or_quota'], [500, 'provider_unavailable'],
])('작성 서버의 %s 오류를 비밀값 없이 구분한다', async (status, kind) => {
  vi.stubEnv('OPENAI_API_KEY', '검사용-비밀키');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, text: async () => '검사용-비밀응답' }));
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt();
    await callLLM({ prompt: '검사용-비공개본문' });
  }).catch(error => error);
  expect(error.evidence.toolFailure).toEqual({ kind, httpStatus: status });
  expect(error.evidence.reviewAudit.events).toHaveLength(2);
  expect(error.evidence.reviewAudit.status).toBe('held');
  expect(JSON.stringify(error)).not.toContain('검사용-');
  expect(error.message).not.toContain('검사용-');
});

it('응답 내용이 잘못된 경우 내용을 저장하지 않고 구분한다', async () => {
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt();
    parseJSONResponse('검사용-비밀응답');
  }).catch(error => error);
  expect(error.evidence.toolFailure.kind).toBe('invalid_json');
  expect(JSON.stringify(error)).not.toContain('검사용-');
  expect(error.message).not.toContain('검사용-');
});

it('알 수 없는 오류는 내용을 노출하거나 원인을 추측하지 않는다', async () => {
  const error = await withNewsReviewAudit(async () => { throw new Error('검사용-비밀응답'); }).catch(error => error);
  expect(error.evidence.toolFailure.kind).toBe('unknown');
  expect(JSON.stringify(error)).not.toContain('검사용-');
  expect(error.message).not.toContain('검사용-');
});

it.each([
  ['OPENAI_API_KEY 환경변수 누락', 'missing_key'],
  ['OpenAI 응답 타임아웃 (20000ms)', 'timeout'],
  ['OpenAI 호출 실패: 검사용-비밀주소', 'connection'],
  ['OpenAI 응답 본문 읽기 실패', 'response_read'],
  ['OpenAI 응답 본문 형식 오류', 'response_format'],
  ['OpenAI 응답에서 텍스트 추출 실패', 'empty_response'],
])('공통 도구 오류를 구분하고 실제 실패 단계는 유지한다: %s', async (message, kind) => {
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt(); audit.pass('generation'); audit.start('facts');
    throw new Error(message);
  }).catch(error => error);
  expect(error.evidence.toolFailure).toEqual({ kind });
  expect(error.evidence.reviewAudit.events.at(-1)).toMatchObject({ stage: 'facts', status: 'held' });
  expect(JSON.stringify(error)).not.toContain('검사용-');
  expect(error.message).not.toContain('검사용-');
});

it('본문 품질 보류를 도구 장애로 바꾸지 않고 기존 근거를 보존한다', async () => {
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt(); audit.start('quality');
    throw new NewsDraftError('핵심 조건 누락', { draft: { title: '보존할 글' } });
  }).catch(error => error);
  expect(error.message).toBe('핵심 조건 누락');
  expect(error.evidence.draft.title).toBe('보존할 글');
  expect(error.evidence.toolFailure).toBeUndefined();
});

it.each([
  ['{"error":{"code":"credit_balance_exhausted","message":"검사용-비밀"}}', 'credit_exhausted'],
  ['{"error":{"type":"insufficient_quota","message":"검사용-비밀"}}', 'insufficient_quota'],
  ['{"error":{"code":"credit_balance_exhausted"', 'rate_or_quota'],
])('온전한 결제 오류와 잘린 응답을 구분한다', async (body, kind) => {
  const error = await withNewsReviewAudit(async audit => {
    audit.nextAttempt(); throw new Error(`OpenAI API 오류 429: ${body}`);
  }).catch(error => error);
  expect(error.evidence.toolFailure).toEqual({ kind, httpStatus: 429 });
  expect(error.message).not.toContain('검사용-');
  expect(JSON.stringify(error)).not.toContain('검사용-');
});

