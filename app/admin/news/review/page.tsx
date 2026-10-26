import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '@/lib/admin-auth-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewLines } from '@/lib/news-publication/review-display';
import { queueStatusLabel, sharedNewsFailure, nextNewsRun } from '@/lib/news-publication/queue-status';
import { newsRetryGuidance } from '@/lib/news-publication/retry-guidance';
import { newsFollowupReasons } from '@/lib/news-publication/followup';

export const dynamic = 'force-dynamic';
export const metadata = { title: '자동 발행 검수 현황 | 키피오', robots: { index: false, follow: false } };

export default async function NewsReviewPage() {
  // 관리자 확인을 마친 뒤에만 비공개 검사 근거를 읽습니다.
  if (!await requireAdminUser()) redirect('/login?next=/admin/news/review');
  const queue = await createAdminClient().rpc('editorial_news_queue_status');
  const latestPublished = await createAdminClient().from('editorial_news_publications')
    .select('published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(1);
  const runs = await createAdminClient().from('editorial_news_runs')
    .select('id,finished_at,result').order('finished_at', { ascending: false }).limit(10);
  const { data, error } = await createAdminClient().from('editorial_news_publications')
    .select('source_id,status,reason,attempted_at,published_at,article_title:article->>title,article_answer:article->>answer,checked_at:article->>checkedAt,classification:article->classification,draft_title:evidence->draft->>title,review_audit:evidence->reviewAudit,tool_failure:evidence->toolFailure')
    .order('attempted_at', { ascending: false }).limit(100);
  const states: Record<string, string> = { published: '공개', held: '보류', processing: '처리 중' };
  const latest = data?.[0];
  const failure = latest?.status === 'held' ? sharedNewsFailure({ toolFailure: latest.tool_failure }) : null;
  const publishedAt = latestPublished.data?.[0]?.published_at;
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href="/admin/news" className="text-blue-600">← 정책뉴스 운영</Link>
    <h1 className="text-2xl font-bold">자동 발행 검수 현황</h1>
    <section className="rounded-xl border p-5">
      <h2 className="font-bold">현재 발행 대기 상태</h2>
      <p>{queueStatusLabel(queue.error ? null : queue.data)}</p>
      <p>마지막 자동 공개: {latestPublished.error ? '조회 실패' : publishedAt
        ? new Date(publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음'}</p>
      <p>다음 예약 시각: {nextNewsRun()} (한국 시간, 공개 성공을 보장하지 않습니다.)</p>
      {failure && <div role="alert" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p>최근 기사 시도에서 확인한 공통 장애: {latest?.reason}</p>
        <p>필요한 조치: {failure === 'credit_exhausted' || failure === 'insufficient_quota'
          ? '작성 서비스의 결제 잔액과 사용 한도를 확인해 주세요.' : '작성 서비스의 운영 인증 설정과 계정 권한을 확인해 주세요.'}</p>
        <p>확인 시각: {latest?.attempted_at ? new Date(latest.attempted_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미확인'}.
          과거 시도 기록이며 현재 복구 여부는 다음 실제 작성 결과로 확인합니다.</p>
      </div>}
      <p className="text-sm">현재 후보 상태입니다. 예약 실행의 성공 여부나 과거 발행 0건의 이유를 뜻하지 않습니다.</p>
    </section>
    <section className="rounded-xl border p-5">
      <h2 className="font-bold">최근 예약 실행</h2>
      {runs.error ? <p role="alert">실행 기록을 읽지 못했습니다.</p> : !runs.data?.length ? <p>새 실행 기록이 없습니다.</p>
        : runs.data.map(run => <p key={run.id}>
          {new Date(run.finished_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {queueStatusLabel({ reason: run.result?.stopReason })}
          {typeof run.result?.published === 'number' ? ` 공개 ${run.result.published}건 · 보류 ${run.result.held ?? 0}건` : ' 처리 건수 미확인'}
        </p>)}
    </section>
    <p>기사별 마지막 처리 기록을 최근 시도 순으로 최대 100건 표시합니다. 전체 실행 이력이나 실패율이 아닙니다.</p>
    <Link href="/admin/news/preview" className="text-blue-600 underline">비공개 초안 검사 열기</Link>
    {error ? <p role="alert">검수 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p> : !data?.length ? <p>처리 기록이 없습니다.</p> : data.map(row =>
      <article key={row.source_id} className="space-y-3 rounded-xl border p-5">
        <h2 className="font-bold">{row.article_title || row.draft_title || `원문 번호 ${row.source_id}`}</h2>
        <p>{states[row.status] || '상태 확인 필요'} · 마지막 시도: {row.attempted_at ? new Date(row.attempted_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음'}</p>
        {row.reason && <p className="break-words">보류 이유: {row.reason}</p>}
        {row.status === 'held' && row.reason && newsRetryGuidance(row.reason) && <p>복구 방향: {newsRetryGuidance(row.reason)}</p>}
        {row.status === 'published' && <Link href={`/admin/news/recheck/${encodeURIComponent(row.source_id)}`} className="text-blue-600 underline">원문 변경·일정·지역 재확인</Link>}
        {row.status === 'published' && <ul>{newsFollowupReasons({
          title: row.article_title ?? '', answer: row.article_answer ?? '', checkedAt: row.checked_at ?? '',
          classification: row.classification,
        }).map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <ul className="space-y-1 text-sm">{reviewLines(row.review_audit, row.attempted_at, row.status).map((line, i) => <li key={i}>{line}</li>)}</ul>
        <a className="text-blue-600 underline" href={`https://www.korea.kr/news/policyNewsView.do?newsId=${encodeURIComponent(row.source_id)}`} target="_blank" rel="noopener noreferrer">공식 원문 확인</a>
      </article>)}
  </div>;
}
