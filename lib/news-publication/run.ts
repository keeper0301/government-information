import { createAdminClient } from '@/lib/supabase/admin';
import type { EditorialNews } from '@/lib/editorial-news-data';
import { generateVerifiedNews } from './generate';
import { readOfficialNews } from './source';
import { officialNewsId } from './validation';
import { classifyEditorialNews } from './classification';
import { NewsDraftError } from './errors';
import { relatedNewsGuide, officialNewsActions } from './reader-context';
import { checkNewsPhoto } from './photo-check';

interface Candidate {
  id: string; source_id: string; title: string; source_url: string; published_at: string;
  updated_at: string | null; ministry: string | null; benefit_tags: string[] | null; lease_token: string;
}

// 한 글이 실패해도 다음 후보를 처리합니다. 시간·한도·중복은 저장소와 함께 제한합니다.
export async function runNewsPublication() {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('뉴스 작성 도구 설정이 없습니다.');
  const admin = createAdminClient();
  const result = { attempted: 0, published: 0, held: 0, conflicts: 0, slugs: [] as string[], stopReason: 'candidate_limit' };
  const started = Date.now();
  try {
    // 작성·재작성·검사 최대 90초와 원문 재확인 시간을 마지막 후보에도 남깁니다.
    for (let index = 0; index < 6 && Date.now() - started < 100000; index++) {
      const claim = await admin.rpc('claim_editorial_news_with_status');
      if (claim.error) throw new Error('뉴스 발행 후보를 예약하지 못했습니다.');
      if (!claim.data) { result.stopReason = 'unknown'; break; }
      if (typeof claim.data.stopReason === 'string') { result.stopReason = claim.data.stopReason; break; }
      const item = claim.data as Candidate;
      result.attempted++;
      let completedEvidence: Record<string, unknown> | null = null;
      try {
        if (officialNewsId(item.source_url) !== item.source_id) throw new Error('수집 번호와 원문 번호가 다릅니다.');
        const source = await readOfficialNews(item.source_url, item.title);
        if (source.publishedAt !== item.published_at.slice(0, 10)) throw new Error('수집 날짜와 공식 발표 날짜가 다릅니다.');
        const draft = await generateVerifiedNews(source);
        completedEvidence = { body: source.body, sections: draft.sections, kind: draft.kind,
          editorialReview: draft.editorialReview, contentDepth: draft.contentDepth, reviewAudit: draft.reviewAudit };
        const current = await readOfficialNews(item.source_url, item.title);
        if (current.hash !== source.hash) throw new Error('작성 중 공식 원문이 변경됐습니다.');
        const today = new Date().toISOString().slice(0, 10);
        const article: EditorialNews = {
          slug: `policy-brief-${item.source_id}`, title: draft.title,
          question: draft.question, answer: draft.answer, audience: draft.audience,
          sourceAgency: item.ministry || '대한민국 정책브리핑', sourceTitle: source.title,
          sourceUrl: source.url, sourcePublishedAt: source.publishedAt, checkedAt: today, updatedAt: today,
          sections: draft.sections.map(({ heading, paragraphs }) => ({ heading, paragraphs })), guideSlug: relatedNewsGuide(draft.title),
          additionalSources: officialNewsActions(draft.title, source.body, today),
          automaticPublication: { checkedAt: new Date().toISOString(), sourceHash: source.hash },
          classification: classifyEditorialNews(draft.title, source.body),
        };
        // 관련 자료사진과 이용 조건을 확인하지 못하면 사진 없는 글을 공개하지 않습니다.
        const photo = await checkNewsPhoto(article);
        completedEvidence.photoReview = photo;
        if (photo.status !== 'passed') throw new Error(photo.reason ?? '자료사진 검사에서 보류했습니다.');
        const saved = await admin.rpc('finish_editorial_news', { p_source_id: item.source_id, p_token: item.lease_token,
          p_article: article, p_hash: source.hash, p_evidence: completedEvidence, p_reason: null,
          p_title: item.title, p_url: item.source_url, p_updated_at: item.updated_at });
        if (saved.error) throw new Error('뉴스 공개 저장에 실패했습니다.');
        if (saved.data !== true) { result.conflicts++; continue; }
        result.published++; result.slugs.push(article.slug);
      } catch (error) {
        const held = await admin.rpc('finish_editorial_news', { p_source_id: item.source_id, p_token: item.lease_token,
          p_article: null, p_hash: null, p_evidence: error instanceof NewsDraftError ? error.evidence : completedEvidence,
          p_reason: error instanceof Error && !/API|OpenAI|fetch/i.test(error.message) ? error.message.slice(0, 180) : '작성 도구 또는 원문 읽기 실패',
          p_title: item.title, p_url: item.source_url, p_updated_at: item.updated_at });
        if (held.error || held.data !== true) result.conflicts++;
        else result.held++;
      }
    }
  } catch {
    // 다음 후보에서 실패해도 이미 공개한 건수와 화면 갱신 주소는 보존합니다.
    result.stopReason = 'failed';
  }
  if (result.stopReason === 'candidate_limit' && result.attempted < 6) result.stopReason = 'time_budget';
  return result;
}
