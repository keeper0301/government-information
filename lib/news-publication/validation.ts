export interface NewsDraft {
  kind: 'application' | 'change' | 'report'; title: string;
  question: string; answer: string; audience: string;
  editorialReview?: unknown;
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
export function newsDraftIssue(value: unknown, body: string, publishedAt?: string): string | null {
  if (!value || typeof value !== 'object') return '초안이 글 형식이 아닙니다.';
  const draft = value as NewsDraft;
  const validText = (text: unknown) => typeof text === 'string' && text.trim().length >= 5
    && /[가-힣]/.test(text) && !/[<>]|https?:\/\//.test(text);
  if (![draft.question, draft.answer, draft.audience].every(validText)
    || !Array.isArray(draft.sections) || draft.sections.length < 3 || draft.sections.length > 6)
    return '질문·답변·대상 또는 본문 3~6개 부분의 형식이 맞지 않습니다.';
  if (!['application', 'change', 'report'].includes(draft.kind) || !validText(draft.title)
    || draft.title.length > 80) return '기사 종류 또는 제목이 맞지 않습니다.';
  if (draft.answer.length > 180) return '핵심 답변을 180자 이내로 줄여주세요.';
  const source = normalizeSourceText(body);
  for (const section of draft.sections) {
    if (!section || !validText(section.heading) || !Array.isArray(section.paragraphs)
      || section.paragraphs.length < 1 || section.paragraphs.length > 3
      || !section.paragraphs.every(validText) || !validText(section.quote)
      || section.quote.length > 300) return '단락 또는 인용문의 형식이 맞지 않습니다.';
    if (section.paragraphs.some(text => text.length > 240)) return '한 문단이 너무 깁니다. 짧은 문단으로 나눠주세요.';
    if (section.paragraphs.some(text => /(.{12,60})\1\1/u.test(text.replace(/\s+/g, '')))) return '같은 구절로 설명을 반복했습니다.';
    if (!source.includes(normalizeSourceText(section.quote))) return '인용문이 공식 원문과 일치하지 않습니다.';
  }
  const prose = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])].join(' ');
  // 독자의 신청 안내와 구분해, 작성자·개발자에게 내리는 내부 작업 지시만 차단합니다.
  const internalInstructions = [
    /(?:코드|컴포넌트|소스\s*파일)(?:를|을|에)?[^.!?\n]{0,35}(?:수정|구현|추가|삭제|배포)(?:하|해)/u,
    /(?:검수자가|심사자가)[^.!?\n]{0,60}(?:보|인식|드러나|판단)/u,
    /(?:이\s*문단|본문에|기사에)[^.!?\n]{0,30}(?:작성|추가|구현|배포)(?:하|해)/u,
    /(?:프롬프트\s*지침|시스템\s*프롬프트|코딩\s*작업\s*지시|quoteIndex)/u,
  ];
  if (internalInstructions.some(pattern => pattern.test(prose))) return '작성·개발 작업 지시가 본문에 섞였습니다.';
  if (prose.length < 300 || prose.length > 2600) return `설명 분량이 기준 밖입니다: ${prose.length}자.`;
  // 같은 숫자의 천 단위 쉼표만 지웁니다. 금액이나 단위 변환은 하지 않습니다.
  const comparableNumber = (text: string) => text.replace(/\s/g, '').replace(/\d{1,3}(?:,\d{3})+/g, value => value.replace(/,/g, ''));
  const numberPattern = /\d(?:[\d,.]*\d)?(?:%|만원|억원|원|년|월|일|명|세|개월)?/g;
  const sourceNumbers = new Set(comparableNumber(source).match(numberPattern) ?? []);
  // 본문에 연도가 없어도 공식 기사 머리말에서 확인한 발표 연도는 근거입니다.
  // 다른 연도·금액·날짜를 함께 허용하지 않고 검증된 날짜의 연도만 추가합니다.
  if (publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
    && Number.isFinite(Date.parse(publishedAt)) && new Date(publishedAt).toISOString().slice(0, 10) === publishedAt)
    sourceNumbers.add(`${publishedAt.slice(0, 4)}년`);
  const numbers = comparableNumber(prose).match(numberPattern) ?? [];
  const unsupported = numbers.filter(number => !sourceNumbers.has(number));
  if (unsupported.length) {
    // 단위가 빠졌고 원문 표기가 하나일 때만 고칠 표기를 알려줍니다. 초안은 계속 보류합니다.
    const unitHints = [...new Set(unsupported)].flatMap(number => {
      if (!/^\d(?:[\d,.]*\d)?$/.test(number)) return [];
      const originals = [...sourceNumbers].filter(original =>
        original.match(/^(\d(?:[\d,.]*\d)?)(%|만원|억원|원|년|월|일|명|세|개월)$/)?.[1] === number);
      return originals.length === 1 ? [`${number} → ${originals[0]}`] : [];
    });
    const hint = unitHints.length ? ` 원문 숫자와 단위를 함께 쓰세요: ${unitHints.slice(0, 3).join(', ')}.` : '';
    return `원문에서 확인하지 못한 숫자: ${unsupported.slice(0, 3).join(', ')}.${hint}`;
  }
  const sentences = prose.split(/[.!?。]|(?:하세요|습니다|입니다)\./).map(normalizeSourceText).filter(text => text.length > 15);
  if (new Set(sentences).size !== sentences.length) return '같은 설명 문장을 반복했습니다.';
  for (let offset = 0; offset + 50 <= prose.length; offset++) {
    if (source.includes(prose.slice(offset, offset + 50))) return '원문 문장을 길게 그대로 옮겼습니다.';
  }
  return null;
}

export function validateNewsDraft(value: unknown, body: string, publishedAt?: string): NewsDraft | null {
  return newsDraftIssue(value, body, publishedAt) === null ? value as NewsDraft : null;
}
