export interface NewsDraft {
  question: string; answer: string; audience: string;
  sections: { heading: string; paragraphs: string[]; quote: string }[];
}

// 수집 주소에서 공식 기사 번호만 읽습니다. 생성된 주소는 사용하지 않습니다.
export function officialNewsId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.korea.kr' || url.username || url.password
      || !/^\/news\/(policyNewsView|customizedNewsView)\.do$/.test(url.pathname)) return null;
    const id = url.searchParams.get('newsId');
    return id && /^\d{9}$/.test(id) ? id : null;
  } catch { return null; }
}

export const normalizeSourceText = (text: string) => text.replace(/\s+/g, ' ').trim();

// 정확한 인용·숫자·분량을 먼저 검사하고 별도 사실 대조 결과도 요구합니다.
export function newsDraftIssue(value: unknown, body: string): string | null {
  if (!value || typeof value !== 'object') return '초안이 글 형식이 아닙니다.';
  const draft = value as NewsDraft;
  const validText = (text: unknown) => typeof text === 'string' && text.trim().length >= 5
    && /[가-힣]/.test(text) && !/[<>]|https?:\/\//.test(text);
  if (![draft.question, draft.answer, draft.audience].every(validText)
    || !Array.isArray(draft.sections) || draft.sections.length !== 3) return '질문·답변·대상 또는 세 부분의 형식이 맞지 않습니다.';
  const source = normalizeSourceText(body);
  for (const section of draft.sections) {
    if (!section || !validText(section.heading) || !Array.isArray(section.paragraphs)
      || section.paragraphs.length < 1 || section.paragraphs.length > 3
      || !section.paragraphs.every(validText) || !validText(section.quote)
      || section.quote.length > 300) return '단락 또는 인용문의 형식이 맞지 않습니다.';
    if (!source.includes(normalizeSourceText(section.quote))) return '인용문이 공식 원문과 일치하지 않습니다.';
  }
  const prose = [draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])].join(' ');
  if (prose.length < 600 || prose.length > 2400) return `설명 분량이 기준 밖입니다: ${prose.length}자.`;
  const numbers = prose.match(/\d[\d,.]*(?:\s*(?:%|만원|억원|원|년|월|일|명|세|개월))?/g) ?? [];
  const unsupported = numbers.filter(number => !source.replace(/\s/g, '').includes(number.replace(/\s/g, '')));
  if (unsupported.length) return `원문에서 확인하지 못한 숫자: ${unsupported.slice(0, 3).join(', ')}.`;
  const sentences = prose.split(/[.!?。]|(?:하세요|습니다|입니다)\./).map(normalizeSourceText).filter(text => text.length > 15);
  if (new Set(sentences).size !== sentences.length) return '같은 설명 문장을 반복했습니다.';
  for (let offset = 0; offset + 50 <= prose.length; offset++) {
    if (source.includes(prose.slice(offset, offset + 50))) return '원문 문장을 길게 그대로 옮겼습니다.';
  }
  return null;
}

export function validateNewsDraft(value: unknown, body: string): NewsDraft | null {
  return newsDraftIssue(value, body) === null ? value as NewsDraft : null;
}
