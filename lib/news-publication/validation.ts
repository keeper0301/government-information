import { plannedStateIssue } from './planned-state';
import { medicalConditionIssue } from './medical-condition';
import { sourceAmountHint } from './source-amounts';
import { comparableSourceDates } from './date-notation';

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

// 긴 단위를 먼저 읽어 보험 세대와 천만 원 금액을 나이·단위 없는 숫자로 자르지 않습니다.
export const newsNumberPattern = /\d(?:[\d,.]*\d)?(?:여명|%|천만원|만원|억원|원|년|월|일|명|세대|세|개월)?/g;

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
  const proseParts = [draft.title, draft.question, draft.answer, draft.audience,
    ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs])];
  const prose = proseParts.join(' ');
  const plannedIssue = plannedStateIssue(draft, body);
  if (plannedIssue) return plannedIssue;
  const medicalIssue = medicalConditionIssue(draft, body);
  if (medicalIssue) return medicalIssue;
  // '월 중'은 월 전체를 보장하지 않습니다. 확인된 원문 기간을 임의로 늘리면 보류합니다.
  const negationEnding = '(?:다는|이라는|라는)\\s*(?:뜻|의미)(?:은|는|이|가)?\\s*아(?:닙니다|니다)';
  // 해당 기간 표현 바로 뒤의 부정만 인정합니다. 다른 조건의 부정으로 기간 오류를 덮지 않습니다.
  const negatesPeriod = (tail: string) => new RegExp(`^\\s*(?:(?:이용할\\s*수\\s*있|지원한|지원받는|지원된|제공한|제공된))?${negationEnding}`, 'u').test(tail);
  const sentencesToCheck = prose.split(/[.!?。]/u);
  for (const sentence of sentencesToCheck) {
    for (const period of sentence.matchAll(/(?<!\d)(\d{1,2})월\s*(?:한\s*달(?:간|동안)?|내내)/gu)) {
      if (negatesPeriod(sentence.slice(period.index + period[0].length))) continue;
      const month = period[1];
      const originalWholePeriods = [...source.matchAll(new RegExp(`(?<!\\d)${month}월\\s*(?:한\\s*달(?:간|동안)?|내내)`, 'gu'))];
      if (new RegExp(`(?<!\\d)${month}월\\s*중`, 'u').test(source)
        && !originalWholePeriods.some(original => !negatesPeriod(source.slice(original.index + original[0].length))))
        return '원문의 월 중 안내를 월 전체 지원으로 확대했습니다. 원문 기간을 유지하세요.';
    }
  }
  // 참여자를 대상으로 한다는 안내만으로 다른 사람의 이용 불가를 확정하지 않습니다.
  const restrictedAudience = '(?:행사\\s*)?(?:참여자|참가자)(?:(?:에게)?만|(?:를)?\\s*대상으로만|(?:를)?\\s*대상으로\\s*(?=한정)|(?:에)?\\s*한(?:해|하여))';
  const exclusiveSupport = new RegExp(`${restrictedAudience}[^.!?。]{0,60}(?:이용|신청|지원|제공|이루어|한정)[^.!?。]*`, 'gu');
  const negatesRestriction = (claim: string) => new RegExp(`^${restrictedAudience}\\s*(?:이용할\\s*수\\s*있|신청할\\s*수\\s*있|지원받는|지원된|제공된|제공한|이루어진|한정된|한정되는)${negationEnding}`, 'u').test(claim);
  const originalRestrictions = (source.match(exclusiveSupport) ?? []).filter(claim => !negatesRestriction(claim));
  for (const claim of prose.matchAll(exclusiveSupport)) {
    if (!originalRestrictions.length && !negatesRestriction(claim[0]))
      return '원문 대상 안내를 확인되지 않은 이용 제한으로 바꿨습니다. 비참여자의 이용 가능 여부를 단정하지 마세요.';
  }
  // 행사 원문에 이름·나이·가명이 함께 명시된 사례만 검사합니다. 일반 단어에서 인명을 추측하지 않습니다.
  if (draft.kind === 'report') {
    const paragraphs = draft.sections.flatMap(section => section.paragraphs);
    const cases = [...source.matchAll(/([가-힣]{2,4})\s*\(\s*\d{1,3}세\s*[,·]\s*가명\s*\)/gu)];
    for (const person of cases) {
      const name = person[1];
      const mentions = paragraphs.filter(text => text.includes(name));
      if (!mentions.length) return `원문 참가 사례 ${name}의 본문 설명을 누락했습니다. 경력과 경험을 원문 근거로 보존하세요.`;
      // 다른 사람의 가명 표시를 빌리지 않고, 해당 이름에 직접 붙은 앞·뒤 표시만 인정합니다.
      const pseudonymLabel = new RegExp(`(?:가명(?:으로)?\\s*(?:소개한|표시한)?\\s*${name}|${name}\\s*(?:씨\\s*)?(?:\\(\\s*(?:\\d{1,3}세\\s*[,·]\\s*)?가명\\s*\\)|[,·]\\s*가명))`, 'u');
      if (mentions.some(text => !pseudonymLabel.test(text)))
        return `원문 참가 사례 ${name}의 가명 표시를 유지하세요.`;
      if (mentions.some(text => !/(?:정책브리핑\s*기자단|원문(?:에서|이|의)?\s*(?:소개|취재))/u.test(text)))
        return `원문 참가 사례 ${name}의 원문 취재 주체를 밝혀주세요. 키피오의 직접 취재로 오해되지 않게 설명하세요.`;
    }
  }
  // 독자의 신청 안내와 구분해, 작성자·개발자에게 내리는 내부 작업 지시만 차단합니다.
  const internalInstructions = [
    // 명령 이름을 언급한 기사와 구분해 개발 명령의 실행·업로드 지시만 차단합니다.
    /\b(?:npm|npx|pnpm|yarn|bun|git)\s+[a-z][\w-]*(?:\s+[\w./-]+)*[^.!?\n]{0,50}(?:실행|업로드|배포|커밋)(?:하세요|하십시오|하시오|하라|해(?:라|요|\s*주세요)?|해야\s*합니다)(?=[\s.!?。]|$)/iu,
    /(?:코드|컴포넌트|소스\s*파일)(?:를|을|에)?[^.!?\n]{0,35}(?:수정|구현|추가|삭제|배포)(?:하|해)/u,
    /(?:검수자가|심사자가)[^.!?\n]{0,60}(?:보|인식|드러나|판단)/u,
    /(?:이\s*문단|본문에|기사에)[^.!?\n]{0,30}(?:작성|추가|구현|배포)(?:하|해)/u,
    /(?:프롬프트\s*지침|시스템\s*프롬프트|코딩\s*작업\s*지시|quoteIndex)/u,
  ];
  if (internalInstructions.some(pattern => pattern.test(prose))) return '작성·개발 작업 지시가 본문에 섞였습니다.';
  if (prose.length < 300 || prose.length > 2600) return `설명 분량이 기준 밖입니다: ${prose.length}자.`;
  // 같은 숫자의 천 단위 쉼표만 지웁니다. 금액이나 단위 변환은 하지 않습니다.
  const comparableNumber = (text: string) => text.replace(/\s/g, '').replace(/\d{1,3}(?:,\d{3})+/g, value => value.replace(/,/g, ''));
  const sourceNumbers = new Set(comparableNumber(source).match(newsNumberPattern) ?? []);
  // 본문에 연도가 없어도 공식 기사 머리말에서 확인한 발표 연도는 근거입니다.
  // 다른 연도·금액·날짜를 함께 허용하지 않고 검증된 날짜의 연도만 추가합니다.
  if (publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
    && Number.isFinite(Date.parse(publishedAt)) && new Date(publishedAt).toISOString().slice(0, 10) === publishedAt)
    sourceNumbers.add(`${publishedAt.slice(0, 4)}년`);
  // 날짜 전체가 원문과 같을 때만 비교 표기를 맞추며, 월·일을 개별 허용하지 않습니다.
  const numberProse = proseParts.map(text => comparableSourceDates(text, body)).join(' ');
  const numbers = comparableNumber(numberProse).match(newsNumberPattern) ?? [];
  const unsupported = numbers.filter(number => !sourceNumbers.has(number));
  if (unsupported.length) {
    // 단위가 빠졌거나 같은 금액의 원문 표기가 하나일 때만 수정 안내를 줍니다. 초안은 계속 보류합니다.
    const unitHints = [...new Set(unsupported)].flatMap(number => {
      // 대략 인원을 확정 인원으로 쓰지는 못합니다. 원문의 '여 명' 표기를 안내합니다.
      const approximate = [...sourceNumbers].filter(original => /여명$/u.test(original)
        && original.replace(/여(?=명$)/u, '') === number);
      if (approximate.length === 1) return [`${number} → ${approximate[0]}`];
      const shortenedAmount = /^(\d+)천만원$/u.exec(number);
      if (shortenedAmount) {
        const original = sourceAmountHint(number, body, prose);
        return original ? [`${number} → ${comparableNumber(original)}`] : [];
      }
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
