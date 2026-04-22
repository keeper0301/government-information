// 클라이언트/서버 양쪽에서 사용할 수 있는 유틸리티 함수

// D-day 계산 (마감일까지 남은 일수)
export function calcDday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

// 제목에 적힌 연도가 너무 오래됐는지 확인
// - 제목에서 20XX 형태 연도(2000~2099) 첫 매치 추출
//   ("2024년", "K-스타트업 2024 부처", "2024" 단독 등 모두 인식)
// - 앞뒤에 다른 숫자가 붙은 경우는 제외 (예: "20241번", "12024" 은 연도 아님)
// - 추출된 연도가 minYear 미만이면 "옛 공고" 로 판단 → true
// - 연도가 없으면 false (상시 프로그램일 가능성이 있으므로 차단하지 않음)
//
// 예) minYear=2025 일 때:
//     "2023년 지원계획" → true
//     "도전! K-스타트업 2024 공고" → true
//     "2025년 모집" / "상시 지원" → false
export function isOutdatedByTitle(
  title: string,
  minYear: number,
): boolean {
  // (?<!\d) = 앞에 숫자 없음, (?!\d) = 뒤에 숫자 없음
  // 20\d{2} = 2000~2099 범위 연도만 (전화번호·우편번호 오탐 최소화)
  const match = title.match(/(?<!\d)(20\d{2})(?!\d)/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  return year < minYear;
}

// 수집·청소에서 공통으로 쓰는 최소 허용 연도
// 올해 - 1 (올해 포함 작년까지 허용, 재작년 이전은 옛 공고)
export function currentMinAllowedYear(): number {
  return new Date().getFullYear() - 1;
}
