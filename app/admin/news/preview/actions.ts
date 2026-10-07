'use server';

import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateVerifiedNews } from '@/lib/news-publication/generate';
import { readOfficialNews, type OfficialNewsSource } from '@/lib/news-publication/source';
import { NewsDraftError } from '@/lib/news-publication/errors';
import { officialNewsId, validateNewsDraft, type NewsDraft } from '@/lib/news-publication/validation';

export interface NewsPreviewResult {
  status: 'idle' | 'passed' | 'held' | 'error';
  message: string;
  source?: OfficialNewsSource;
  draft?: NewsDraft;
  evidenceText?: string;
}

// 실제 운영 작성 도구로 검사하지만 저장·공개·보류 상태 변경은 하지 않습니다.
export async function previewNewsDraft(_previous: NewsPreviewResult, form: FormData): Promise<NewsPreviewResult> {
  if (!await requireAdminUser()) return { status: 'error', message: '관리자 로그인이 필요합니다.' };
  const sourceId = String(form.get('sourceId') ?? '').trim();
  if (!/^\d{9}$/.test(sourceId)) return { status: 'error', message: '공식 기사 번호 9자리를 입력하세요.' };
  let source: OfficialNewsSource | undefined;
  let stage = '수집 기사 조회';
  try {
    // 입력 주소를 직접 요청하지 않고 이미 수집한 기사의 공식 주소만 사용합니다.
    const { data, error } = await createAdminClient().from('news_posts')
      .select('title, source_url, published_at').eq('source_id', sourceId).eq('is_hidden', false).maybeSingle();
    if (error || !data) return { status: 'error', message: '검사할 수집 기사를 찾지 못했습니다.' };
    if (officialNewsId(data.source_url) !== sourceId)
      return { status: 'error', message: '수집 번호와 공식 기사 번호가 다릅니다.' };
    stage = '공식 원문 읽기';
    source = await readOfficialNews(data.source_url, data.title);
    if (source.publishedAt !== data.published_at?.slice(0, 10))
      return { status: 'error', message: '수집 날짜와 공식 발표 날짜가 다릅니다.' };
    stage = '초안 작성·검사';
    const draft = await generateVerifiedNews(source);
    return { status: 'passed', message: '초안이 자동 검사를 통과했습니다. 공개하지 않았습니다.',
      source, draft, evidenceText: JSON.stringify(draft, null, 2) };
  } catch (error) {
    if (error instanceof NewsDraftError) {
      const evidence = error.evidence as { draft?: unknown } | null;
      const draft = source ? validateNewsDraft(evidence?.draft, source.body, source.publishedAt) : null;
      return { status: 'held', message: error.message, source, draft: draft ?? undefined,
        evidenceText: JSON.stringify(error.evidence, null, 2) };
    }
    // 원래 오류를 기록하지 않고 정해 둔 단계와 종류만 화면·서버 기록에 남깁니다.
    let reason = '호출에 실패했습니다.';
    if (error instanceof Error) {
      const providerStatus = error.message.match(/^OpenAI API 오류 (\d{3}):/)?.[1];
      if (error.name === 'TimeoutError' || /^OpenAI 응답 타임아웃 \(\d+ms\)$/.test(error.message))
        reason = '응답 대기 시간이 초과됐습니다.';
      else if (providerStatus === '401' || providerStatus === '403') reason = '작성 도구 인증을 확인해야 합니다.';
      else if (providerStatus === '429') reason = '작성 도구 사용 한도에 도달했습니다.';
      else if (providerStatus?.startsWith('5')) reason = '작성 도구 서버가 응답하지 못했습니다.';
      else if (error.message.startsWith('JSON 파싱 실패:')) reason = '작성 결과 형식을 읽지 못했습니다.';
      else if (providerStatus === '400') reason = '작성 요청 형식을 확인해야 합니다.';
      else if (error.message.startsWith('OpenAI 호출 실패:')) reason = '작성 도구 연결에 실패했습니다.';
      else if (error.message === 'OpenAI 응답에서 텍스트 추출 실패') reason = '작성 도구가 읽을 수 있는 글을 반환하지 않았습니다.';
      else if (error.message === 'OpenAI 응답 본문 읽기 실패') reason = '작성 응답을 끝까지 읽지 못했습니다.';
      else if (error.message === 'OpenAI 응답 본문 형식 오류') reason = '작성 응답 본문 형식을 읽지 못했습니다.';
      else if (error.message === 'OPENAI_API_KEY 환경변수 누락') reason = '작성 도구 인증 설정이 없습니다.';
    }
    console.warn('정책뉴스 비공개 검사 실패', { stage, reason });
    return { status: 'error', message: `${stage} 단계에서 ${reason} 공개하지 않았습니다.` };
  }
}
