import type { NewsDraft } from './validation';

import { eventEndDates as endDates } from './event-dates';

const event = /행사|팝업스토어|전시|축제|공연/u;
const current = /운영(?:된다|됩니다|한다|합니다|\s*중)|열(?:린다|립니다)|진행(?:된다|됩니다)|(?:입장|방문|관람)(?:할\s*수\s*있(?:다|습니다)|\s*가능(?:하다|합니다))/u;
const historical = /(?:(?:당시|발표|원문)[^.!?。]{0,60}|(?:다고|라고)\s*)(?:안내|예고|발표|소개)(?:했다|했습니다|하였다|하였습니다|됐다|됐습니다|되었다|되었습니다)\s*$/u;

// 같은 문장 안에서도 부정한 주장과 별도의 긍정 주장을 구분합니다.
function hasCurrentClaim(sentence: string): boolean {
  return [...sentence.matchAll(new RegExp(current.source, 'gu'))].some(match =>
    !/^(?:이라는|라는|는)\s*(?:뜻|의미)(?:은|는|가)?\s*(?:아닙니다|아니다|아니며|아니고)/u
      .test(sentence.slice(match.index! + match[0].length)));
}

export function expiredEventIssue(draft: NewsDraft, body: string, publishedAt: string | undefined,
  reviewDate: string): string | null {
  const sourceEnds = endDates(body, publishedAt);
  // 모든 본문 근거가 같은 행사 기간을 가리킬 때만 날짜 없는 요약에도 적용합니다.
  // 여러 행사가 섞이거나 날짜 없는 별도 근거가 있으면 각 부분의 근거로만 판단합니다.
  const sharedEnd = sourceEnds.length === 1 && draft.sections.length > 0
    && draft.sections.every(section => endDates(section.quote, publishedAt).includes(sourceEnds[0]))
    ? sourceEnds[0] : undefined;
  const groups = [
    { context: [draft.title, draft.answer].join(' '), texts: [draft.title, draft.question, draft.answer, draft.audience], fallback: sharedEnd },
    ...draft.sections.map(section => ({ context: [section.quote, ...section.paragraphs].join(' '), texts: [section.heading, ...section.paragraphs] })),
  ];
  for (const group of groups) {
    if (!event.test(group.context)) continue;
    const expired = endDates(group.context, publishedAt).find(end => end < reviewDate && sourceEnds.includes(end))
      ?? ('fallback' in group && group.fallback && group.fallback < reviewDate ? group.fallback : undefined);
    if (!expired) continue;
    for (const sentence of group.texts.flatMap(text => text.split(/[.!?。\n]/u))) {
      if (hasCurrentClaim(sentence) && !historical.test(sentence))
        return `원문에 명시된 행사 기간(${expired})이 검사일(${reviewDate})보다 앞섭니다. 현재 운영·입장 가능으로 안내하지 말고 발표 당시 일정으로 설명하세요. 실제 개최·종료 여부는 추정하지 마세요.`;
    }
  }
  return null;
}
