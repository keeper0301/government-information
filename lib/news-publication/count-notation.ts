// 신고·접수 건수는 날짜와 다른 단위입니다. '4만 7천 건'의 7을 '7일'로 안내하지 않습니다.
const quantity = String.raw`\d[\d,]*(?:\.\d+)?(?:\s*[억만천](?:\s*\d[\d,]*(?:\.\d+)?)?)*`;
const counts = new RegExp(String.raw`(?:(?:약|최대|최소)\s*)?${quantity}(?:\s*(?:건\s*)?(?:~|∼|～|–|-)\s*${quantity})?\s*여?\s*건(?:\s*(?:이상|이하|초과|미만|가량|정도|안팎))?`, 'gu');
const compact = (text: string) => text.replace(/\s|,/gu, '');

export function countNotationIssue(prose: string, source: string): string | null {
  const originals = source.match(counts) ?? [];
  const allowed = new Set(originals.map(compact));
  const changed = (prose.match(counts) ?? []).find(value => !allowed.has(compact(value)));
  if (!changed) return null;
  return `원문과 다른 건수 표기입니다: ${changed}. 만·천 단위와 여·약·이상 조건을 원문 그대로 보존하세요.${originals.length ? ` 원문 건수: ${[...new Set(originals)].slice(0, 5).join(', ')}.` : ''}`;
}

export const NUMBER_NOTATION_GUIDANCE = `원문이 '오는 14일' 또는 '지난 7일'이면 발표일이나 사진 날짜에서 월을 추정해 붙이지 마세요. 월이 필요한 설명은 원문의 날짜 표기로 유지하고, 부족한 정보는 확정하지 마세요.
건수는 원문의 만·천 단위와 여·약·이상·이하를 그대로 보존하세요. 예를 들어 '4만 7000여 건'을 '4만 7천 건'으로, '4만여 건'을 '4만 건 이상'으로 바꾸지 마세요. 건수 안의 숫자는 날짜가 아닙니다.`;
