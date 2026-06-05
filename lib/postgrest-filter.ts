// ============================================================
// PostgREST .or() 필터 안전 입력 헬퍼
// ============================================================
// PostgREST .or() 문자열에서 쉼표(,)는 조건 구분자, 괄호( )는 논리 그룹,
// 점(.)은 column.operator.value 구분자다. 사용자 검색어에 이 문자가 섞이면
// 필터 문법이 깨져 쿼리 500 에러(가용성 저하)가 나거나, EXCLUDED 필터를
// 우회하는 임의 조건이 주입될 수 있다(필터 인젝션). 그래서 보간 전에 이
// 메타문자를 공백으로 치환해 제거하고, ILIKE 와일드카드 % _ \ 는 리터럴로
// 검색되도록 escape 한다. (RLS 가 있어 데이터 유출은 아니나 검색 오작동 방지)
// ============================================================

// 단일 값(전체 문구를 하나의 ilike 패턴으로 쓸 때) 안전화.
export function escapeOrFilterValue(raw: string): string {
  return raw
    .replace(/[,().]/g, " ") // PostgREST .or() 메타문자 제거
    .replace(/[%_\\]/g, "\\$&") // ILIKE 와일드카드 escape
    .replace(/\s+/g, " ")
    .trim();
}

// 공백 분리 토큰 배열(토큰 AND 매칭용). 빈 토큰 제외.
export function tokenizeForOrFilter(raw: string): string[] {
  return escapeOrFilterValue(raw)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}
