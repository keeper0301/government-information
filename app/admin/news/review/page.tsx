import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewLines } from '@/lib/news-publication/review-display';

export const dynamic = 'force-dynamic';
export const metadata = { title: '자동 발행 검수 현황 | 키피오', robots: { index: false, follow: false } };

export default async function NewsReviewPage() {
  // 관리자 확인을 마친 뒤에만 비공개 검사 근거를 읽습니다.
  if (!await requireAdminUser()) redirect('/login?next=/admin/news/review');
  const { data, error } = await createAdminClient().from('editorial_news_publications')
    .select('source_id,status,reason,attempted_at,published_at,article_title:article->>title,draft_title:evidence->draft->>title,review_audit:evidence->reviewAudit')
    .order('attempted_at', { ascending: false }).limit(100);
  const states: Record<string, string> = { published: '공개', held: '보류', processing: '처리 중' };
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href="/admin/news" className="text-blue-600">← 정책뉴스 운영</Link>
    <h1 className="text-2xl font-bold">자동 발행 검수 현황</h1>
    <p>기사별 마지막 처리 기록을 최근 시도 순으로 최대 100건 표시합니다. 전체 실행 이력이나 실패율이 아닙니다.</p>
    <Link href="/admin/news/preview" className="text-blue-600 underline">비공개 초안 검사 열기</Link>
    {error ? <p role="alert">검수 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p> : !data?.length ? <p>처리 기록이 없습니다.</p> : data.map(row =>
      <article key={row.source_id} className="space-y-3 rounded-xl border p-5">
        <h2 className="font-bold">{row.article_title || row.draft_title || `원문 번호 ${row.source_id}`}</h2>
        <p>{states[row.status] || '상태 확인 필요'} · 마지막 시도: {row.attempted_at ? new Date(row.attempted_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음'}</p>
        {row.reason && <p className="break-words">보류 이유: {row.reason}</p>}
        <ul className="space-y-1 text-sm">{reviewLines(row.review_audit, row.attempted_at, row.status).map((line, i) => <li key={i}>{line}</li>)}</ul>
        <a className="text-blue-600 underline" href={`https://www.korea.kr/news/policyNewsView.do?newsId=${encodeURIComponent(row.source_id)}`} target="_blank" rel="noopener noreferrer">공식 원문 확인</a>
      </article>)}
  </div>;
}
