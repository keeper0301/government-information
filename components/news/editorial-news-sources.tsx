import type { EditorialNews } from '@/lib/editorial-news-data';

// 보충 설명에 사용한 공식 자료만 연결합니다. 작성 도구가 만든 임의 주소는 허용하지 않습니다.
export function verifiedAdditionalSources(article: EditorialNews) {
  return (Array.isArray(article.additionalSources) ? article.additionalSources : []).filter(source => {
    if (!source || typeof source.title !== 'string' || typeof source.scope !== 'string'
      || typeof source.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) return false;
    try {
      const url = new URL(source.url);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['academy.visitkorea.or.kr', 'www.work24.go.kr'].includes(url.hostname);
    } catch { return false; }
  });
}

export function EditorialAdditionalSources({ article }: { article: EditorialNews }) {
  return verifiedAdditionalSources(article).map(source => <div key={source.url} className="mt-5">
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{source.title}</a>
    <p className="text-sm text-grey-600 mt-2">보충 근거 · 확인 {source.checkedAt} · {source.scope}</p>
  </div>);
}
