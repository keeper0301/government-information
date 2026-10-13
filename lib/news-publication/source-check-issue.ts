// 통과 표시만으로 빠진 검사를 덮지 않고, 본문 밖에 보류 원인을 기록합니다.
export function sourceCheckIssue(value: unknown, sectionCount: number, body: string,
  draft?: { sections: { quote: string }[] }): string | null {
  if (!Array.isArray(value)) return '검사 결과 목록이 없습니다.';
  const parts = Array.from({ length: sectionCount + 1 }, (_, part) => part);
  const label = (part: number) => part === 0 ? '제목·핵심 안내' : `본문 ${part}`;
  const missing = parts.filter(part => !value.some(check => check?.part === part));
  if (value.length !== parts.length || missing.length)
    return `검사 결과 개수: 필요 ${parts.length}개, 수신 ${value.length}개.${missing.length ? ` 누락: ${missing.map(label).join(', ')}.` : ' 중복·범위 밖 번호를 확인하세요.'}`;
  const source = body.replace(/\s+/g, ' ');
  for (const part of parts) {
    const check = value.find(item => item?.part === part);
    if (check.supported !== true) return `${label(part)}의 사실 확인이 통과하지 않았습니다.`;
    if (typeof check.quote !== 'string' || check.quote.length < 10 || check.quote.length > 300)
      return `${label(part)}의 원문 근거 번호 또는 인용 길이가 맞지 않습니다.`;
    if (!source.includes(check.quote.replace(/\s+/g, ' ')))
      return `${label(part)}의 인용이 공식 원문과 일치하지 않습니다.`;
    // 같은 원문의 다른 문장으로 해당 본문의 근거를 바꿔치기하지 않습니다.
    if (draft && part > 0 && check.quote !== draft.sections[part - 1]?.quote)
      return `${label(part)}의 검사 근거가 해당 본문에 연결한 원문과 다릅니다.`;
  }
  return null;
}

// 검사자가 다른 근거로 합격시키지 않도록 본문별 근거와 미확인 번호만 제공합니다.
// 이 제한은 근거의 연결을 보존하며 문장의 의미까지 자동으로 입증하지 않습니다.
export function sourceAffinitySchema<T extends { name: string; schema: Record<string, unknown> }>(
  response: T, draft: { sections: { quote: string }[] }, quotes: string[]): T {
  const properties = response.schema.properties as Record<string, Record<string, unknown>>;
  const items = Array.from({ length: draft.sections.length + 1 }, (_, part) => {
    const indexes = quotes.flatMap((quote, index) => part === 0 || quote === draft.sections[part - 1]?.quote ? [index] : []);
    return { type: 'object', additionalProperties: false, required: ['part', 'supported', 'quoteIndex'],
      properties: { part: { type: 'integer', enum: [part] }, supported: { type: 'boolean' },
        quoteIndex: { type: 'integer', enum: [-1, ...indexes] } } };
  });
  return { ...response, schema: { ...response.schema, properties: { ...properties,
    checks: { ...properties.checks, items: { anyOf: items } } } } };
}
