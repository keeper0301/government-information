'use client';
import { useCallback, useEffect, useState } from 'react';

type Item = { id: string; title: string; source_url: string | null; policy_guidance?: { status?: string } };
export function PolicyGuidanceQueue({ type, onSelect }: { type: string; onSelect: (id: string) => void }) {
  const [items, setItems] = useState<Item[]>([]); const [page, setPage] = useState(0);
  const [search, setSearch] = useState(''); const [submitted, setSubmitted] = useState('');
  const [total, setTotal] = useState(0); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('all');
  const load = useCallback(async (signal: AbortSignal) => {
    setBusy(true); setItems([]); setMessage('');
    try {
      const response = await fetch(`/api/admin/policy-guidance/queue?${new URLSearchParams({ type,
        page: String(page), search: submitted, issue })}`, { signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!signal.aborted) { setItems(data.items); setTotal(data.total ?? 0); }
    } catch (error) { if (!signal.aborted) setMessage(error instanceof Error ? error.message : '목록 조회 실패'); }
    finally { if (!signal.aborted) setBusy(false); }
  }, [type, page, submitted, issue]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal);
    return () => controller.abort(); }, [load]);
  return <section className="border rounded p-4 space-y-3" aria-label="정책 검수 대기 목록">
    <h2 className="font-bold">검수할 정책 찾기</h2>
    <label>점검 종류 <select value={issue} onChange={event => { setIssue(event.target.value); setPage(0); }}>
      <option value="all">설명 검수 대기</option><option value="source">공식 원문 확인 필요</option>
      <option value="application">신청 주소가 기관 첫 화면</option></select></label>
    <form onSubmit={event => { event.preventDefault(); setPage(0); setSubmitted(search); }}>
      <label>정책 제목 검색 <input value={search} maxLength={100} className="border p-2"
        onChange={event => setSearch(event.target.value)} /></label>
      <button className="border p-2" disabled={busy}>검색</button>
    </form>
    <p role="status">{busy ? '목록을 불러오는 중입니다.' : message || `전체 ${total.toLocaleString()}개`}</p>
    <ul className="space-y-2">{items.map(item => <li key={item.id}>
      <button type="button" className="text-blue-700 underline text-left" onClick={() => onSelect(item.id)}>{item.title}</button>
      <span className="ml-2">{item.policy_guidance?.status === 'approved' ? '승인 기록 있음' : '검수 필요'}</span>
      {!item.source_url && <span className="ml-2">원문 주소 없음</span>}
    </li>)}</ul>
    <div className="flex gap-3">
      <button type="button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>이전</button>
      <button type="button" disabled={busy || (page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>다음</button>
    </div>
  </section>;
}
