import { createAdminClient } from '@/lib/supabase/admin';
import type { EditorialNews } from '@/lib/editorial-news-data';
import { generateVerifiedNews } from './generate';
import { readOfficialNews } from './source';
import { officialNewsId } from './validation';
import { PROVINCES } from '@/lib/regions';
import { NewsDraftError } from './errors';

interface Candidate {
  id: string; source_id: string; title: string; source_url: string; published_at: string;
  updated_at: string | null; ministry: string | null; benefit_tags: string[] | null; lease_token: string;
}

// 한 글이 실패해도 다음 후보를 처리합니다. 시간·한도·중복은 저장소와 함께 제한합니다.
export async function runNewsPublication() {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('뉴스 작성 도구 설정이 없습니다.');
  const admin = createAdminClient();
  const result = { attempted: 0, published: 0, held: 0, conflicts: 0, slugs: [] as string[] };
  const started = Date.now();
  for (let index = 0; index < 6 && Date.now() - started < 160000; index++) {
    const claim = await admin.rpc('claim_editorial_news');
    if (claim.error) throw new Error('뉴스 발행 후보를 예약하지 못했습니다.');
    if (!claim.data) break;
    const item = claim.data as Candidate;
    result.attempted++;
    try {
      if (officialNewsId(item.source_url) !== item.source_id) throw new Error('수집 번호와 원문 번호가 다릅니다.');
      const source = await readOfficialNews(item.source_url, item.title);
      if (source.publishedAt !== item.published_at.slice(0, 10)) throw new Error('수집 날짜와 공식 발표 날짜가 다릅니다.');
      const draft = await generateVerifiedNews(source);
      const current = await readOfficialNews(item.source_url, item.title);
      if (current.hash !== source.hash) throw new Error('작성 중 공식 원문이 변경됐습니다.');
      const today = new Date().toISOString().slice(0, 10);
      // 제목과 대상에 명시된 지역만 분류하고, 없다고 전국 사업으로 추측하지 않습니다.
      const locationText = `${source.title} ${draft.audience}`;
      const regions: string[] = [...new Set(PROVINCES.filter(region => locationText.includes(region.name))
        .map(region => ['jeonnam', 'gwangju'].includes(region.code) ? 'jeonnam-gwangju' : region.code))];
      if (locationText.includes('전국')) regions.push('nationwide');
      const article: EditorialNews = {
        slug: `policy-brief-${item.source_id}`, title: `${source.title} — 확인할 조건과 준비 순서`,
        question: draft.question, answer: draft.answer, audience: draft.audience,
        sourceAgency: item.ministry || '대한민국 정책브리핑', sourceTitle: source.title,
        sourceUrl: source.url, sourcePublishedAt: source.publishedAt, checkedAt: today, updatedAt: today,
        sections: draft.sections.map(({ heading, paragraphs }) => ({ heading, paragraphs })), guideSlug: '',
        automaticPublication: { checkedAt: new Date().toISOString(), sourceHash: source.hash },
        classification: { benefits: item.benefit_tags ?? [], regions: regions.length ? regions : ['unclassified'] },
      };
      const saved = await admin.rpc('finish_editorial_news', { p_source_id: item.source_id, p_token: item.lease_token,
        p_article: article, p_hash: source.hash, p_evidence: { body: source.body, sections: draft.sections }, p_reason: null,
        p_title: item.title, p_url: item.source_url, p_updated_at: item.updated_at });
      if (saved.error) throw new Error('뉴스 공개 저장에 실패했습니다.');
      if (saved.data !== true) { result.conflicts++; continue; }
      result.published++; result.slugs.push(article.slug);
    } catch (error) {
      const held = await admin.rpc('finish_editorial_news', { p_source_id: item.source_id, p_token: item.lease_token,
        p_article: null, p_hash: null, p_evidence: error instanceof NewsDraftError ? error.evidence : null,
        p_reason: error instanceof Error && !/API|OpenAI|fetch/i.test(error.message) ? error.message.slice(0, 180) : '작성 도구 또는 원문 읽기 실패',
        p_title: item.title, p_url: item.source_url, p_updated_at: item.updated_at });
      if (held.error || held.data !== true) result.conflicts++;
      else result.held++;
    }
  }
  return result;
}
