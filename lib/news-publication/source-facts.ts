import { normalizeSourceText } from './validation';

export interface SourceFacts {
  periods: { text: string; quoteIndexes: number[] }[];
  audienceQuoteIndexes: number[];
  cases: { name: string; label: string; quoteIndexes: number[] }[];
}

// 이미 선택한 같은 원문 배열을 사용합니다. 문장을 다시 나눠 근거 번호를 바꾸지 않습니다.
// 명시된 월 중 표현과 한국어 이름·나이·가명 표기만 읽으며 의미를 추측하지 않습니다.
export function collectSourceFacts(body: string, quotes: string[]): SourceFacts {
  const quoteIndexes = (text: string) => quotes.flatMap((quote, index) =>
    normalizeSourceText(quote).includes(normalizeSourceText(text)) ? [index] : []);
  const periods = [...new Set((body.match(/(?<!\d)\d{1,2}월\s*중/gu) ?? []).map(normalizeSourceText))]
    .map(text => ({ text, quoteIndexes: quotes.flatMap((quote, index) =>
      (quote.match(/(?<!\d)\d{1,2}월\s*중/gu) ?? []).some(period => normalizeSourceText(period) === text) ? [index] : []) }));
  const seenLabels = new Set<string>();
  const cases = [...body.matchAll(/([가-힣]{2,4})\s*\(\s*\d{1,3}세\s*[,·]\s*가명\s*\)/gu)]
    .flatMap(match => {
      const label = normalizeSourceText(match[0]);
      if (seenLabels.has(label)) return [];
      seenLabels.add(label);
      return [{ name: match[1], label, quoteIndexes: quoteIndexes(match[0]) }];
    });
  return { periods, cases, audienceQuoteIndexes: quotes.flatMap((quote, index) => /대상/u.test(quote) ? [index] : []) };
}

// 기존 분할 동작을 유지합니다. 내용을 줄이거나 문장을 잘라내지 않습니다.
function splitLongParagraphs(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.flatMap(text => {
    if (typeof text !== 'string' || text.length <= 240) return [text];
    const paragraphs: string[] = [];
    let paragraph = '';
    for (const sentence of text.split(/(?<=[.!?。])\s+/u)) {
      if (paragraph && paragraph.length + 1 + sentence.length > 240) {
        paragraphs.push(paragraph);
        paragraph = sentence;
      } else paragraph += `${paragraph ? ' ' : ''}${sentence}`;
    }
    if (paragraph) paragraphs.push(paragraph);
    return paragraphs;
  });
}

// 코드가 붙이는 것은 원문 가명과 소개 표시뿐입니다. 잘못 쓴 사실은 고치지 않습니다.
export function prepareSourceDraft(value: unknown, facts: SourceFacts, quotes: string[]): { value: unknown; issue: string | null } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { sections?: unknown }).sections))
    return { value, issue: null };
  const draft = value as Record<string, unknown> & { sections: unknown[] };
  const sections = draft.sections.map(section => {
    if (!section || typeof section !== 'object') return section;
    const part = section as Record<string, unknown>;
    return { ...part, paragraphs: splitLongParagraphs(part.paragraphs),
      quote: Number.isInteger(part.quoteIndex) ? quotes[part.quoteIndex as number] : undefined };
  });
  const mapped = { ...draft, sections };
  // 앞서 있던 잘못된 본문·인용 형식을 새 사례 번호 오류가 가리지 않습니다.
  const validText = (text: unknown) => typeof text === 'string' && text.trim().length >= 5
    && /[가-힣]/u.test(text) && !/[<>]|https?:\/\//u.test(text);
  if (sections.length < 3 || sections.length > 6 || !sections.every(section => {
    const part = section as Record<string, unknown> | null;
    return part && validText(part.heading) && validText(part.quote) && (part.quote as string).length <= 300
      && Array.isArray(part.paragraphs) && part.paragraphs.length >= 1 && part.paragraphs.length <= 3
      && part.paragraphs.every(validText);
  })) return { value: mapped, issue: null };
  let issue: string | null = null;
  const prepared = sections.map(section => {
    const part = section as Record<string, unknown> & { paragraphs: string[] };
    const caseIndex = part.caseIndex;
    if (!Number.isInteger(caseIndex) || (caseIndex as number) < -1 || (caseIndex as number) >= facts.cases.length) {
      issue ??= '원문 사례 번호가 없거나 범위를 벗어났습니다.';
      return part;
    }
    if (draft.kind !== 'report') {
      if (caseIndex !== -1) issue ??= '신청·변경형 기사의 사례 번호는 일반 본문 표시여야 합니다.';
      return part;
    }
    if (caseIndex === -1) {
      if (facts.cases.some(person => part.paragraphs.some(text => text.includes(person.name))))
        issue ??= '참가 사례 문단에 원문 사례 번호가 필요합니다.';
      return part;
    }
    const person = facts.cases[caseIndex as number];
    if (!person.quoteIndexes.includes(part.quoteIndex as number)) {
      issue ??= '참가 사례는 해당 사람의 원문 근거 번호를 선택해야 합니다.';
      return part;
    }
    if (facts.cases.some(other => other.name !== person.name && part.paragraphs.some(text => text.includes(other.name)))) {
      issue ??= '한 사례 부분에 다른 참가자의 사례가 섞였습니다.';
      return part;
    }
    const prefix = `원문에서 소개한 ${person.label}: `;
    return { ...part, paragraphs: part.paragraphs.map(text => text.startsWith(prefix) ? text : prefix + text) };
  });
  return { value: { ...mapped, sections: prepared }, issue };
}
