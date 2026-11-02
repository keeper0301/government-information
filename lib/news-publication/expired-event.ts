import type { NewsDraft } from './validation';

// 날짜가 분명한 행사 기간만 비교합니다. 날짜가 지났다고 실제 개최·종료를 만들어내지 않습니다.
function endDates(text: string, publishedAt?: string): string[] {
  const dates: string[] = [];
  const range = /(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|[~～–-])\s*(?:(\d{1,2})월\s*)?(\d{1,2})일\s*까지/gu;
  for (const match of text.matchAll(range)) {
    const year = match[1] ?? publishedAt?.match(/^(\d{4})-\d{2}-\d{2}$/u)?.[1];
    if (!year) continue;
    const month = Number(match[4] ?? match[2]);
    const startMonth = Number(match[2]);
    // 연도가 생략된 날짜는 발표월과 같은 월인 경우만 사용합니다.
    if (!match[1] && (Number(publishedAt?.slice(5, 7)) !== startMonth
      || /지난해|작년|내년|다음\s*해/u.test(text))) continue;
    // 연말을 넘는 기간이나 발표 연도와 다른 해를 추정해야 하는 문장은 별도 사실 검수에 맡깁니다.
    if (month < startMonth || (month === startMonth && Number(match[5]) < Number(match[3]))) continue;
    const date = `${year}-${String(month).padStart(2, '0')}-${match[5].padStart(2, '0')}`;
    const start = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    if ([date, start].every(value => Number.isFinite(Date.parse(value))
      && new Date(value).toISOString().slice(0, 10) === value)) dates.push(date);
  }
  return dates;
}

const event = /행사|팝업스토어|전시|축제|공연/u;
const current = /운영(?:된다|됩니다|한다|합니다|\s*중)|열(?:린다|립니다)|진행(?:된다|됩니다)|(?:입장|방문|관람)(?:할\s*수\s*있(?:다|습니다)|\s*가능(?:하다|합니다))/u;
const historical = /(?:(?:당시|발표|원문)[^.!?。]{0,60}|(?:다고|라고)\s*)(?:안내|예고|발표|소개)(?:했다|했습니다|하였다|하였습니다|됐다|됐습니다|되었다|되었습니다)\s*$/u;

export function expiredEventIssue(draft: NewsDraft, body: string, publishedAt: string | undefined,
  reviewDate: string): string | null {
  const sourceEnds = endDates(body, publishedAt);
  const groups = [
    { context: [draft.title, draft.answer].join(' '), texts: [draft.title, draft.question, draft.answer, draft.audience] },
    ...draft.sections.map(section => ({ context: [section.quote, ...section.paragraphs].join(' '), texts: [section.heading, ...section.paragraphs] })),
  ];
  for (const group of groups) {
    if (!event.test(group.context)) continue;
    const expired = endDates(group.context, publishedAt).find(end => end < reviewDate && sourceEnds.includes(end));
    if (!expired) continue;
    for (const sentence of group.texts.flatMap(text => text.split(/[.!?。\n]/u))) {
      if (current.test(sentence) && !historical.test(sentence))
        return `원문에 명시된 행사 기간(${expired})이 검사일(${reviewDate})보다 앞섭니다. 현재 운영·입장 가능으로 안내하지 말고 발표 당시 일정으로 설명하세요. 실제 개최·종료 여부는 추정하지 마세요.`;
    }
  }
  return null;
}
