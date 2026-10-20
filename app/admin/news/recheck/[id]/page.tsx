import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EditorialNews } from '@/lib/editorial-news-data';
import { readOfficialNews } from '@/lib/news-publication/source';
import { compareNewsSource } from '@/lib/news-publication/followup';

export const dynamic = 'force-dynamic';
export const metadata = { title: '정책뉴스 원문 재확인 | 키피오', robots: { index: false, follow: false } };

export default async function NewsRecheckPage({ params }: { params: Promise<{ id: string }> }) {
  // 관리자 인증을 통과하기 전에는 원문과 비공개 자료를 조회하지 않습니다.
  if (!await requireAdminUser()) redirect('/login?next=/admin/news/review');
  const { id } = await params;
  if (!/^\d{9}$/.test(id)) notFound();
  const { data, error } = await createAdminClient().from('editorial_news_publications')
    .select('article,source_hash').eq('source_id', id).eq('status', 'published').maybeSingle();
  if (error) return <p role="alert">기사 조회에 실패했습니다. 다시 확인해 주세요.</p>;
  if (!data?.article) notFound();
  const article = data.article as EditorialNews;
  let comparison;
  try {
    const source = await readOfficialNews(article.sourceUrl, article.sourceTitle);
    comparison = compareNewsSource(article, data.source_hash, source);
  } catch {
    return <div><Link href="/admin/news/review">검수 현황으로 돌아가기</Link>
      <p role="alert">공식 원문을 다시 확인하지 못했습니다. 접속 문제나 원문 제목 변경 여부를 직접 확인해 주세요.</p></div>;
  }
  return <div className="mx-auto max-w-4xl space-y-4">
    <Link href="/admin/news/review">← 검수 현황</Link>
    <h1 className="text-2xl font-bold">{article.title} — 원문 재확인</h1>
    <p>{comparison.sourceState}</p>
    <p>원문이 같아도 일정은 지날 수 있습니다. 현재 시행·신청 가능 여부를 자동으로 확정하지 않습니다.</p>
    <ul>{comparison.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <h2 className="font-bold">저장된 분류와 현재 규칙의 대조</h2>
    <pre className="whitespace-pre-wrap">{JSON.stringify({ 저장된분류: article.classification, 재계산분류: comparison.classification }, null, 2)}</pre>
    <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">공식 원문에서 일정과 적용 범위 확인</a>
    <p>이 조회는 기사 내용·분류·마지막 확인일을 변경하지 않습니다. 변경할 문장과 근거를 검토한 뒤 수정해야 합니다.</p>
  </div>;
}
