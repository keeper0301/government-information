// ============================================================
// apply_url 정제 · 검증 유틸
// ============================================================
// 수집된 apply_url 이 사용자 입장에서 "누르면 바로 원문이 뜨는" 직링크인지
// 판정한다. 정부·지자체 사이트의 수집 데이터는 아래와 같은 깨진 값이
// 드물지 않아 상세 페이지 "신청하기" 버튼이 에러 페이지로 이동하는 사고가 발생.
//
// 2026-04-24 전수조사 결과:
// - 한글/공백 포함 15건 (loan 서민금융진흥원) — 설명문이 URL 에 통째 포함
// - 홈페이지 only 712건 (loan 711 + welfare 1) — deep link 누락
// - 쿼리 없는 .do/.jsp 210건 (loan 207 + welfare 3) — 동적 라우팅 ID 없음
// ============================================================

// ─── sanitizeApplyUrl ───
// 확실히 깨진 URL 은 null 로 반환. 상세 페이지 fallback (Google 검색) 로 전환.
// 보수적으로 '누가 봐도 URL 이 아닌' 것만 null 처리 (false positive 최소화).
export function sanitizeApplyUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 프로토콜 확인 — 없으면 URL 이 아님
  if (!/^https?:\/\//i.test(trimmed)) return null;

  // 공백 포함 — URL 에 설명문이 끼어들어간 경우
  // 예: "http://www.kinfa.or.kr (서금원 홈페이지 ...)"
  // 예: "http://www.kinfa.or.kr%20(서금원%20...)" (percent-encoded 공백)
  if (/\s/.test(trimmed)) return null;

  // percent-decoded 후 한글 포함 — 위와 같은 패턴
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // malformed %-sequence — URL 자체가 깨진 것
    return null;
  }
  if (/[가-힣]/.test(decoded)) return null;

  // URL 파싱 불가 → 문법 오류
  try {
    new URL(trimmed);
  } catch {
    return null;
  }

  return trimmed;
}

// ─── isDeepLink ───
// apply_url 이 "신청 화면까지 안내하는 직링크" 인지 판정.
// false 면 UI 에서 '신청하기' 대신 '기관 홈페이지 방문' 같은 중립 라벨로 표시.
//
// sanitizeApplyUrl 과 분리한 이유: 홈페이지만 있는 URL 도 '완전히 잘못된 것' 은
// 아니므로 DB 에서 지우기보다 UI 라벨만 구분하는 게 정직한 UX.
export function isDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }

  // 홈페이지 only — path 가 없거나 '/' 뿐, 쿼리/프래그먼트도 없음
  const pathOnlyRoot = u.pathname === "/" || u.pathname === "";
  if (pathOnlyRoot && !u.search && !u.hash) return false;

  // 동적 라우팅 확장자 (.do/.jsp/.asp/.aspx) 인데 쿼리/프래그먼트 없음
  // → 서버가 어떤 콘텐츠를 보여줄지 알 수 없음 (대표적으로 서울시 청년수당)
  if (/\.(do|jsp|asp|aspx)$/i.test(u.pathname) && !u.search && !u.hash) {
    return false;
  }

  return true;
}
