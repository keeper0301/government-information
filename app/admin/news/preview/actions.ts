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
  try {
    // 입력 주소를 직접 요청하지 않고 이미 수집한 기사의 공식 주소만 사용합니다.
    const { data, error } = await createAdminClient().from('news_posts')
      .select('title, source_url, published_at').eq('source_id', sourceId).eq('is_hidden', false).maybeSingle();
    if (error || !data) return { status: 'error', message: '검사할 수집 기사를 찾지 못했습니다.' };
    if (officialNewsId(data.source_url) !== sourceId)
      return { status: 'error', message: '수집 번호와 공식 기사 번호가 다릅니다.' };
    source = await readOfficialNews(data.source_url, data.title);
    if (source.publishedAt !== data.published_at?.slice(0, 10))
      return { status: 'error', message: '수집 날짜와 공식 발표 날짜가 다릅니다.' };
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
    // 작성 도구의 원래 오류에는 인증·서버 정보가 있을 수 있어 화면에 전달하지 않습니다.
    return { status: 'error', message: '원문 읽기 또는 작성 도구 호출에 실패했습니다. 공개하지 않았습니다.' };
  }
}
