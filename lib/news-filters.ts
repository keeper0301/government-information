// ============================================================
// lib/news-filters.ts — 네이버 뉴스 노이즈 필터 (5종 통합)
// ============================================================
// 네이버 뉴스 검색은 "지원금" 같은 키워드로 광범위 검색하는 1차 필터라
// 시민이 신청 가능한 정책 외에 다양한 노이즈가 섞임.
//
// 28,314건 전수조사 결과 (2026-04-25):
//   - 정치 인물·정당:        3,113건 (11.0%)
//   - 대괄호 모음/일정/소식:  2,063건 ( 7.3%)
//   - 기업 CSR·사회공헌:        512건 ( 1.8%)
//   - 사건사고·법조:             11건
//   - 정부 평가·시사 분석:       25건
//   ─────────────────────────────────────
//   - Unique 합집합:          5,577건 (19.7%)
//
// POLITICAL_ACTION_TITLE 패턴 보정 (false positive 회귀):
//   초기 키워드 셋에 "간담회 개최·취임식·발족식·예방 인사·동행 방문" 포함했더니
//   "구례군, 간담회 개최" / "전남도, ..." / "캠코, ..." 등 정상 지자체 행정 정책
//   다수가 잘못 매칭됨 ([가-힣]{2,3} 가 인명뿐 아니라 지자체·기관명도 잡음).
//   → 키워드를 명백히 정치성 강한 것 (공약 발표·출마 선언·경선·기자회견·단식·장외)
//     으로 좁히고 + 기관명 negative lookahead 추가. 정책 보존 우선.
//
// 검사 대상은 title 1줄. body/summary 는 정상 정책 뉴스에도 정치 직함이
// 등장하므로 false positive 위험 → title 매칭만으로 충분히 노이즈 차단되고
// 정상 정책 뉴스는 보존됨.
//
// 이 모듈은 collect 단계 (welfare/loan 분기 저장 직전) + DB cleanup
// 양쪽에서 재사용. 한 곳에서 패턴 갱신하면 두 경로 모두 갱신됨.
// ============================================================

// ━━━ 1. 정치 인물·정당 (11.0%) ━━━
// 인명(2-3자) + 직함, [Who Is] 시리즈, 정당명, 인명+정치액션 4가지 패턴.
const POLITICAL_NAME_TITLE = /[가-힣]{2,3}\s*(?:의원|시장|지사|의장|위원장|후보|당선인|군수|구청장|구의원|시의원|도의원|총리|장관|차관|대표|예비후보|경선후보|원내대표|당대표)/;
const POLITICAL_PROFILE = /\[Who\s+Is/i;
const POLITICAL_PARTY = /더불어민주당|국민의힘|정의당|진보당|개혁신당|조국혁신당|새진보연합|기본소득당|자유통일당/;
// 인명(2-3자) + 쉼표 + 짧은 거리 + 정치 활동 키워드.
// 직함이 명시 안 돼도 "박수현, 5대 분야 장애인 공약 발표" 같은 인물 활동 잡음.
//
// false positive 방지 2단계:
//   1) negative lookahead 로 기관·지자체명 제외.
//      "구례군, 간담회 개최" / "전남도, ..." / "산림청, ..." / "경기도, ..."
//      처럼 [가-힣]{1,2} + (군·시·도·구·읍·면·동·청·부·처·원) 으로 끝나는
//      토큰은 인명 아님. 28,314건 전수조사에서 "간담회 개최" 같은 행정 활동 키워드를
//      포함하면 지자체 정상 정책 30+ 건이 삭제되는 회귀 발견 → 추가.
//   2) 키워드는 명백히 정치성 강한 것만 (간담회 개최·취임식·발족식·예방 인사·
//      동행 방문 제외 — 정상 행정 행사와 구분 어려움).
const POLITICAL_ACTION_TITLE = /^(?![가-힣]{1,2}(?:군|시|도|구|읍|면|동|청|부|처|원))[가-힣]{2,3}\s*,\s*.{0,30}(?:공약\s*발표|출마\s*선언|경선|기자회견|단식\s*투쟁|장외\s*투쟁)/;

export function isPoliticalNoise(title: string): boolean {
  if (!title) return false;
  return (
    POLITICAL_NAME_TITLE.test(title) ||
    POLITICAL_PROFILE.test(title) ||
    POLITICAL_PARTY.test(title) ||
    POLITICAL_ACTION_TITLE.test(title)
  );
}

// ━━━ 2. 대괄호 모음/일정/소식 (7.3%) ━━━
// "[오늘의 주요일정]전북", "[E-로컬뉴스]영천시", "[패트롤] 광명-군포",
// "[위클리오늘] 부산 중구 소식", "[비바 2080] 우리 고향 100세", "[사회공헌 단신]"
// → 한 매체가 여러 지자체 활동을 묶어 보도. 시민이 신청할 단일 정책 아님.
const BRACKET_DIGEST = /\[[^\]]*(?:일정|소식|브리핑|패트롤|위클리|로컬뉴스|단신|모음|투데이|뉴스\s*모음|크루|핫이슈)[^\]]*\]/;

export function isBracketDigest(title: string): boolean {
  if (!title) return false;
  return BRACKET_DIGEST.test(title);
}

// ━━━ 3. 기업 CSR·사회공헌 (1.8%) ━━━
// "동아쏘시오그룹 신입사원 봉사활동", "KT&G 일손돕기", "BNK 장학금 전달",
// "KB손해보험 ESG 경영" → 기업 활동 보도. 시민이 신청 가능한 공공 정책 X.
const CSR_ACTIVITY = /(?:봉사활동|사회공헌|ESG\s*경영|기관표창|기관\s*표창|역대\s*최다|봉사단|일손돕기|기부\s*전달|장학금\s*전달|시상제\s*참석)/;

export function isCsrActivity(title: string): boolean {
  if (!title) return false;
  return CSR_ACTIVITY.test(title);
}

// ━━━ 4. 사건사고·법조 (0.04%, 11건) ━━━
// "○○ 살해하고 야산에 유기한 친모 구속기소" → 정책 정보 0.
// 작은 비중이지만 사용자 신뢰 손상이 매우 크니 차단.
const CRIME_REPORT = /(?:구속기소|체포\s*조사|살해|구속영장|시신\s*유기|숨진\s*채\s*발견|구속송치|승소\s*판결|패소\s*판결)/;

export function isCrimeReport(title: string): boolean {
  if (!title) return false;
  return CRIME_REPORT.test(title);
}

// ━━━ 5. 정부 평가·시사 분석 (0.09%, 25건) ━━━
// "이재명 정부 뒷받침", "탄핵 정국에 주요 상권 코로나 때보다" → 정치 분석.
// 인물명 안 들어가도 차단해야 정치성 보도 완전히 거름.
const GOVERNMENT_OPINION = /(?:이재명\s*정부|윤석열\s*정부|문재인\s*정부|민주당\s*정책|국민의힘\s*정책|탄핵\s*정국|정권\s*교체|보수\s*정권|진보\s*정권)/;

export function isGovernmentOpinion(title: string): boolean {
  if (!title) return false;
  return GOVERNMENT_OPINION.test(title);
}

// ============================================================
// 통합 게이트 — 모든 노이즈 패턴 OR 매칭
// ============================================================
// collect 단계에서는 이 함수만 호출하면 모든 패턴 차단.
// 새 노이즈 패턴 발견 시 위에 함수 추가하고 여기 OR 로 합치기만 하면 됨.

export function isNewsNoise(title: string): boolean {
  if (!title) return false;
  return (
    isPoliticalNoise(title) ||
    isBracketDigest(title) ||
    isCsrActivity(title) ||
    isCrimeReport(title) ||
    isGovernmentOpinion(title)
  );
}
