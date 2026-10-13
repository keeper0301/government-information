const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);

// 원문과 초안 양쪽에서 부호·복합 단위가 없는 독립 금액만 비교합니다.
const independentAmount = (text: string, offset: number, length: number) => {
  const before = text.slice(0, offset), after = text.slice(offset + length);
  return !/[+\-−]\s*$/u.test(before)
    && !/\d(?:[\d,.]*\d)?\s*(?:경|조|억|만|천|백)\s*원?\s*$/u.test(before)
    && !/^\s*\d(?:[\d,.]*\d)?\s*(?:경|조|억|만|천|백)\s*원/u.test(after);
};

// 소수 문자열을 정수 원 단위로 정확히 비교합니다. 반올림한 수치를 같은 금액으로 인정하지 않습니다.
const exactWon = (token: string): bigint | null => {
  const parsed = /^(\d+)(?:\.(\d+))?(원|만원|억원)$/u.exec(token);
  if (!parsed) return null;
  const places = { 원: 0, 만원: 4, 억원: 8 }[parsed[3]] ?? 0;
  const fraction = (parsed[2] ?? '').replace(/0+$/u, '');
  if (fraction.length > places) return null;
  const won = BigInt(parsed[1] + fraction.padEnd(places, '0'));
  return won <= BigInt(Number.MAX_SAFE_INTEGER) ? won : null;
};

// 복원과 수정 안내가 같은 금액 판별을 사용합니다. 금액의 일부나 반올림 값을 근거로 삼지 않습니다.
export function sourceAmountHint(shortened: string, body: string, prose?: string): string | null {
  const digits = /^(\d+)천만원$/u.exec(shortened)?.[1];
  if (!digits) return null;
  if (prose !== undefined) {
    const mentions = [...prose.matchAll(/(?<![\d,.])(\d+)\s*천\s*만\s*원/gu)]
      .filter(match => `${match[1]}천만원` === shortened);
    if (!mentions.length || mentions.some(match => !independentAmount(prose, match.index, match[0].length))) return null;
  }
  const won = BigInt(digits) * BigInt(10000000);
  if (won > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const amounts = [...body.matchAll(/(?<![\d,.])\d(?:[\d,.]*\d)?\s*(?:억\s*원|만\s*원|원)/gu)]
    .filter(match => independentAmount(body, match.index, match[0].length))
    .map(match => ({ text: match[0].replace(/\s+/g, ' '), token: match[0].replace(/\s|,/g, '') }));
  const candidates = amounts.filter(amount => exactWon(amount.token) === won);
  return new Set(candidates.map(amount => amount.token)).size === 1 ? candidates[0].text : null;
}

// 금액이 정확히 같고 원문 표기가 하나일 때만 복원합니다. 연도나 다른 금액은 추측하지 않습니다.
export function restoreSourceAmounts(value: unknown, body: string): unknown {
  if (!record(value) || !Array.isArray(value.sections) || !value.sections.every(section =>
    record(section) && Array.isArray(section.paragraphs) && section.paragraphs.every(text => typeof text === 'string')))
    return value;
  const sourceNumbers = new Set(body.replace(/\s/g, '').match(/\d+천만원/gu) ?? []);
  const restore = (text: unknown) => typeof text !== 'string' ? text : text.replace(
    /(?<![\d,.])(\d+)\s*천\s*만\s*원/gu, (original, digits: string, offset: number) => {
      if (!independentAmount(text, offset, original.length)) return original;
      if (sourceNumbers.has(`${digits}천만원`)) return original;
      return sourceAmountHint(`${digits}천만원`, body) ?? original;
    });
  // 공개 문장만 바꾸며 인용문·근거 번호와 입력 객체는 보존합니다.
  return { ...value, ...Object.fromEntries(['title', 'question', 'answer', 'audience'].map(key => [key, restore(value[key])])),
    sections: value.sections.map(section => ({ ...section as Record<string, unknown>, heading: restore(section.heading),
      paragraphs: (section.paragraphs as string[]).map(restore) })) };
}
