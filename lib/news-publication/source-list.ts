import { normalizeSourceText } from './validation';

export interface SourceList { names: string[]; quote: string; quoteIndex: number }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);

// 목록을 코드가 붙이는 글만 다섯 부분으로 제한합니다. 글자 수 강제는 문장을 끊을 수 있어 사용하지 않습니다.
export function sourceListSchema(response: { name: string; schema: Record<string, unknown> }, list: SourceList | null) {
  if (!list) return response;
  const properties = response.schema.properties as Record<string, Record<string, unknown>>;
  const sections = properties.sections;
  const item = sections.items as Record<string, unknown>;
  return { ...response, schema: { ...response.schema, properties: { ...properties,
    sections: { ...sections, minItems: 3, maxItems: 5, items: { ...item,
      properties: { ...(item.properties as Record<string, unknown>),
        paragraphs: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 5 } } },
    } },
  } } };
}

// 원문에 수와 이름이 명시된 긴 직무 목록 하나만 읽습니다. 의미나 새로운 직무를 추측하지 않습니다.
export function collectSourceList(body: string, quotes: string[]): SourceList | null {
  const source = normalizeSourceText(body);
  const candidates = quotes.flatMap((quote, quoteIndex) => {
    if (!source.includes(normalizeSourceText(quote))
      || /희망|바란|바라|제안|제언|아니|확인되지|확인하지|미확인|부인|허위|거짓|사실이\s*없/u.test(quote)) return [];
    const matches = [...quote.matchAll(/(?<!\d)([3-6])대\s*(?:유망\s*)?직무\s*\(([^()\n]+)\)/gu)];
    return matches.flatMap(match => {
      const names = match[2].split(',').map(name => name.trim());
      if (names.length !== Number(match[1]) || new Set(names).size !== names.length || match[2].length < 50
        || !names.every(name => name.length >= 2 && name.length <= 40 && /^[가-힣A-Za-z0-9·&\s-]+$/u.test(name))) return [];
      return [{ names, quote, quoteIndex }];
    });
  });
  return candidates.length === 1 ? candidates[0] : null;
}

// 고유명사는 바꿔 쓰지 않고 짧은 사실 목록으로 보존하며, 별도 해설의 분량을 대신 채우지 않습니다.
function listSection(list: SourceList) {
  return { heading: '원문에서 확인한 직무',
    paragraphs: Array.from({ length: Math.ceil(list.names.length / 2) }, (_, index) =>
      `소개된 직무: ${list.names.slice(index * 2, index * 2 + 2).join(' · ')}`),
    quoteIndex: list.quoteIndex, caseIndex: -1, quote: list.quote, sourceFactList: true };
}

// 기존 글은 건드리지 않습니다. 여섯 부분을 초과하거나 기존 목록이 조작되면 검사에서 보류합니다.
export function attachSourceList(value: unknown, list: SourceList | null): unknown {
  if (!list || !record(value) || !Array.isArray(value.sections)
    || value.sections.some(section => record(section) && section.sourceFactList === true)
    || value.sections.length >= 6) return value;
  return { ...value, sections: [...value.sections, listSection(list)] };
}

export function sourceListIssue(value: unknown, list: SourceList | null): string | null {
  if (!list) return null;
  if (!record(value) || !Array.isArray(value.sections)) return '원문 직무 목록의 본문 형식이 맞지 않습니다.';
  const matches = value.sections.filter(section => record(section) && section.sourceFactList === true);
  const actual = matches[0];
  const expected = listSection(list);
  // 코드가 보존하는 목록은 문장 형식이 아닙니다. 모델의 해설만 문장 중간 절단 여부를 확인합니다.
  const incomplete = value.sections.some(section => record(section) && section.sourceFactList !== true
    && Array.isArray(section.paragraphs) && section.paragraphs.some(text => typeof text === 'string'
      && text.length <= 240 && !/[.!?。]["'’”\])]*$/u.test(text.trim())));
  if (incomplete) return '본문 문장이 끝나기 전에 끊겼습니다. 완결된 문장으로 다시 작성하세요.';
  return matches.length === 1 && record(actual)
    && Object.entries(expected).every(([key, text]) => JSON.stringify(actual[key]) === JSON.stringify(text))
    ? null : '원문으로 확인한 직무 목록을 누락하거나 바꿨습니다. 해설은 다섯 부분 이내로 작성하세요.';
}
