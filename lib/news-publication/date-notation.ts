// 원문에 있는 완전한 날짜와 정확히 같은 한국어 날짜만 숫자 비교용으로 맞춥니다.
// 공개 글은 바꾸지 않으며 발표일만 보고 월·일을 추측하지 않습니다.
export function comparableSourceDates(text: string, body: string): string {
  const dates = new Map<string, string>();
  for (const match of body.matchAll(/(?<![\p{L}\d.])(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?!\s*\d)/gu)) {
    const before = body.slice(0, match.index);
    // 버전 표시나 부호가 붙은 값은 달력 모양이어도 날짜 근거로 삼지 않습니다.
    if (/(?:버전|\bversion|\bver\.?|\bv)\s*[:：]?\s*$/iu.test(before) || /[+\-−]\s*$/u.test(before)) continue;
    const key = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const time = Date.parse(`${key}T00:00:00Z`);
    // 존재하지 않는 날짜나 달력 범위를 벗어난 값은 근거로 사용하지 않습니다.
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== key) continue;
    dates.set(key, match[0].replace(/\s/g, ''));
  }
  return text.replace(/(?<!\d)(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu,
    (original, year: string, month: string, day: string, offset: number) => {
      // 부호와 '일차'는 일반 날짜의 조사와 구별합니다.
      if (/[+\-−]\s*$/u.test(text.slice(0, offset)) || /^차/u.test(text.slice(offset + original.length))) return original;
      return dates.get(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`) ?? original;
    });
}
