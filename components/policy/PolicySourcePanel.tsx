import { isDeepLink, sanitizeApplyUrl } from '@/lib/utils/apply-url';
import type { EvidenceGuide } from '@/lib/policy/evidence-guide';

export function PolicySourcePanel({ source, sourceUrl, updatedAt, guide }: {
  source: string; sourceUrl: string | null; updatedAt: string; guide: EvidenceGuide | null;
}) {
  const safe = sanitizeApplyUrl(sourceUrl);
  const url = safe ? new URL(safe) : null;
  const internal = url && ['keepioo.com', 'www.keepioo.com'].includes(url.hostname);
  return <section className="bg-white border border-grey-200 rounded-xl px-6 py-4 mb-6 text-sm">
    <h2 className="font-semibold">자료 제공 기관: {source}</h2>
    {safe && url ? <a href={safe} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
      {internal ? '관련 키피오 뉴스' : isDeepLink(safe) ? guide ? '확인한 원문 보기' : '수집 출처 보기' : `기관 홈페이지 (${url.hostname})`}
    </a> : <p>해당 공고의 원문 주소를 확인 중입니다.</p>}
    <p className="text-grey-700 mt-2">자료 갱신일: {updatedAt.slice(0, 10)}</p>
    <p className="text-grey-700">원문 확인일: {guide?.source.checkedAt?.slice(0, 10) ?? '미확인'}</p>
    <p className="text-grey-700">사람 검수일: {guide?.reviewedAt?.slice(0, 10) ?? '검수 전'}</p>
    {!guide && <p className="text-grey-700">수집 출처는 해당 사업·연도와 일치하는지 추가 확인이 필요합니다.</p>}
  </section>;
}
