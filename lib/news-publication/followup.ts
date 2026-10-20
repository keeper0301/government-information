import type { EditorialNews } from '@/lib/editorial-news-data';
import { classifyEditorialNews } from './classification';

// 확인일이 오래됐거나 일정 표현이 있는 글을 재검토 대상으로 올립니다. 시행·종료를 자동 단정하지 않습니다.
export function newsFollowupReasons(article: Pick<EditorialNews, 'title' | 'answer' | 'checkedAt'>
  & Partial<Pick<EditorialNews, 'sections'>> & { classification?: unknown }, now = new Date()) {
  const reasons: string[] = [];
  const checked = Date.parse(`${article.checkedAt}T00:00:00+09:00`);
  if (!Number.isFinite(checked)) reasons.push('마지막 확인일을 확인할 수 없습니다.');
  else if (now.getTime() - checked >= 7 * 86400000) reasons.push('마지막 확인 후 7일이 지났습니다.');
  const text = [article.title, article.answer, ...(article.sections ?? []).flatMap(section => section.paragraphs)].join(' ');
  if (/예정|마감|접수|신청.*기간|\d{1,2}월\s*\d{1,2}일/.test(text))
    reasons.push('일정·예정 표현이 있어 현재 상태를 원문으로 재확인할 대상입니다.');
  const classification = article.classification;
  if (classification && typeof classification === 'object' && 'regions' in classification
    && Array.isArray(classification.regions) && classification.regions.includes('unclassified'))
    reasons.push('적용 지역의 근거를 다시 확인할 대상입니다.');
  return reasons;
}

export function compareNewsSource(article: EditorialNews, savedHash: string | null, current: { hash: string; body: string }) {
  return {
    sourceState: !savedHash ? '발행 당시 원문 비교값이 없어 변경 여부 미확인'
      : savedHash === current.hash ? '발행 당시와 원문 내용이 같습니다.' : '원문 내용이 바뀌었습니다. 차이를 검토해야 합니다.',
    classification: classifyEditorialNews(article.title, current.body),
    reasons: newsFollowupReasons(article),
  };
}
