// 원문에 적힌 기간만 읽습니다. 연말을 넘는 일정은 양쪽 연도가 명시된 경우만 사용합니다.
export function eventEndDates(text: string, publishedAt?: string): string[] {
  const normalized = text.replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.\s*[~～–-]\s*(\d{1,2})\.(\d{1,2})\.(?!\d)/gu,
    '$1월 $2일부터 $3월 $4일까지');
  const range = /(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|[~～–-])\s*(?:(\d{4})년\s*)?(?:(\d{1,2})월\s*)?(\d{1,2})일\s*(?:까지)?/gu;
  const dates: string[] = [];
  for (const match of normalized.matchAll(range)) {
    const year = match[1] ?? publishedAt?.match(/^(\d{4})-\d{2}-\d{2}$/u)?.[1];
    if (!year) continue;
    const startMonth = Number(match[2]);
    const endMonth = Number(match[5] ?? match[2]);
    const publicationMonth = Number(publishedAt?.slice(5, 7));
    if (!match[1] && (publicationMonth < startMonth || publicationMonth > endMonth
      || /지난해|작년|내년|다음\s*해/u.test(text))) continue;
    const start = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const end = `${match[4] ?? year}-${String(endMonth).padStart(2, '0')}-${match[6].padStart(2, '0')}`;
    if (end < start || (match[4] && !match[1])) continue;
    if ([start, end].every(value => Number.isFinite(Date.parse(value))
      && new Date(value).toISOString().slice(0, 10) === value)) dates.push(end);
  }
  return dates;
}
