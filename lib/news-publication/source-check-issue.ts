// 통과 표시만으로 빠진 검사를 덮지 않고, 본문 밖에 보류 원인을 기록합니다.
export function sourceCheckIssue(value: unknown, sectionCount: number, body: string): string | null {
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
  }
  return null;
}
