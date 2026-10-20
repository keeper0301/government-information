import { afterEach, expect, it, vi } from 'vitest';
import { checkNewsPhoto } from '@/lib/news-publication/photo-check';
import { queueStatusLabel } from '@/lib/news-publication/queue-status';
import { newsFollowupReasons, compareNewsSource } from '@/lib/news-publication/followup';
import { newsRetryGuidance } from '@/lib/news-publication/retry-guidance';
import type { EditorialNews } from '@/lib/editorial-news-data';
import { classifyEditorialNews } from '@/lib/news-publication/classification';

const article: EditorialNews = { slug: '검사용', title: '한복문화주간 행사', answer: '행사 예정 안내', checkedAt: '2026-10-20',
  question: '무엇을 확인하나요?', audience: '독자', sourceAgency: '공식 기관', sourceTitle: '공식 제목',
  sourceUrl: 'https://www.korea.kr/news/policyNewsView.do?newsId=148973768', sourcePublishedAt: '2026-10-19',
  updatedAt: '2026-10-20', guideSlug: '',
  sections: [], classification: { benefits: ['문화'], regions: ['unclassified'] } };
afterEach(() => vi.unstubAllGlobals());
it('원본과 두 반응형 사진을 모두 확인하며 한 파일 실패도 보류한다', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-type': 'image/webp' } }));
  vi.stubGlobal('fetch', request);
  expect((await checkNewsPhoto(article)).status).toBe('passed');
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.every(([url, options]) => url.startsWith('https://www.keepioo.com/images/news/')
    && options.method === 'HEAD' && options.redirect === 'error')).toBe(true);
  request.mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect((await checkNewsPhoto(article)).status).toBe('held');
});
it('성공 상태의 오류 문서와 연결 실패도 사진으로 인정하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-type': 'text/html' } })));
  expect((await checkNewsPhoto(article)).status).toBe('held');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('연결 실패')));
  expect((await checkNewsPhoto(article)).status).toBe('held');
});
it('허용된 주제 사진이 없거나 공식 사진 전용이면 요청하지 않는다', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  expect((await checkNewsPhoto({ ...article, title: '새 행정 안내' })).status).toBe('held');
  expect((await checkNewsPhoto({ ...article, photoPolicy: 'official-only' })).status).toBe('held');
  expect(request).not.toHaveBeenCalled();
});
it('대기 이유와 확인 실패를 구분한다', () => {
  expect(queueStatusLabel({ reason: 'daily_limit' })).toContain('3편');
  expect(queueStatusLabel({ reason: 'retry_wait' })).toContain('재시도');
  expect(queueStatusLabel({ reason: 'no_candidates' })).toContain('새 후보');
  expect(queueStatusLabel(null)).toContain('확인하지 못');
  expect(queueStatusLabel({ reason: 'unknown' })).toContain('확인하지 못');
});
it('오래된 글과 일정은 재검토 대상으로만 분류하고 상태를 자동 변경하지 않는다', () => {
  const copy = JSON.stringify(article);
  const reasons = newsFollowupReasons(article, new Date('2026-10-28T00:00:00Z'));
  expect(reasons.join(' ')).toContain('7일');
  expect(reasons.join(' ')).toContain('일정');
  expect(JSON.stringify(article)).toBe(copy);
  expect(compareNewsSource(article, null, { hash: '새값', body: '원문' }).sourceState).toContain('미확인');
  expect(compareNewsSource(article, '옛값', { hash: '새값', body: '원문' }).sourceState).toContain('바뀌');
  expect(compareNewsSource(article, '같음', { hash: '같음', body: '원문' }).sourceState).toContain('같습니다');
});
it('날짜와 지시문 수정은 사실을 추가하거나 핵심 조건을 삭제하도록 안내하지 않는다', () => {
  expect(newsRetryGuidance('원문에서 확인하지 못한 숫자: 10월')).toContain('덧붙이지');
  expect(newsRetryGuidance('작성·개발 작업 지시가 본문에 섞였습니다.')).toContain('핵심 조건');
  expect(newsRetryGuidance('다른 오류')).toBe('');
});
it('한복문화주간은 전국 참여처의 정확한 근거가 있을 때만 전국으로 보완한다', () => {
  const evidence = '공모로 선정된 기획프로그램도 전국 곳곳에서 만나볼 수 있다';
  expect(classifyEditorialNews('한복문화주간 행사', `${evidence}.`)).toMatchObject({
    regions: ['nationwide'], regionEvidence: evidence,
  });
  expect(classifyEditorialNews('한복문화주간 행사', '전국 대회 수상자가 참석했다.').regions).toEqual(['unclassified']);
  expect(classifyEditorialNews('임산부의 날 서비스 소개', '서울 마포구 행사장에서 열렸다.').regions).toEqual(['unclassified']);
});
