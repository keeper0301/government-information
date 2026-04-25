// ============================================================
// 표준 태그 사전 (택소노미)
// ============================================================
// 모든 컬렉터·enrich·알림 매칭의 공통 기준
// 여기에 없는 값이 DB 에 들어가면 매칭이 안 되므로 추가·삭제는 신중히
// ============================================================

// 지역 태그 — 광역시도 기준 (+ "전국")
// 기업마당·보조금24 의 hashtag/region 필드를 이 값으로 정규화한다
export const REGION_TAGS = [
  "전국",
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
export type RegionTag = typeof REGION_TAGS[number];

// 연령 태그 — 대상 연령층 분류
// 청년 = 만 19~39, 중장년 = 40~64, 노년 = 65+
export const AGE_TAGS = [
  "영유아",  // 0~6
  "학생",    // 초·중·고
  "청년",    // 19~39
  "중장년",  // 40~64
  "노년",    // 65+
  "전연령",  // 연령 제한 없음
] as const;
export type AgeTag = typeof AGE_TAGS[number];

// 업종·직업 태그 — 사용자 상태
export const OCCUPATION_TAGS = [
  "소상공인",
  "자영업자",
  "직장인",
  "구직자",
  "대학생",
  "주부",
  "농어민",
  "프리랜서",
  "창업자",
  "전체",  // 누구나
] as const;
export type OccupationTag = typeof OCCUPATION_TAGS[number];

// 혜택 분야 태그 — 정책이 어떤 도움을 주는가
export const BENEFIT_TAGS = [
  "주거",   // 전세·월세·임대·주택
  "의료",   // 건강보험·진료비·건강검진
  "양육",   // 보육·출산·양육비·아동수당
  "교육",   // 학자금·장학금·교육비
  "문화",   // 문화·여가·체육
  "취업",   // 일자리·직업훈련
  "창업",   // 창업자금·멘토링
  "금융",   // 대출·보증·저축
  "생계",   // 생계비·기초수급
  "에너지", // 전기·가스·난방비
  "교통",   // 교통비·대중교통
  "장례",   // 장례비·사망
  "법률",   // 법률상담·무료변호
  "기타",
] as const;
export type BenefitTag = typeof BENEFIT_TAGS[number];

// 가구·개인 상태 태그 — 특수 조건
export const HOUSEHOLD_TAGS = [
  "1인가구",
  "신혼부부",
  "한부모",
  "다자녀",
  "다문화",
  "저소득",       // 기초·차상위·저소득층
  "장애인",
  "국가유공자",
  "일반",         // 특수조건 없음
] as const;
export type HouseholdTag = typeof HOUSEHOLD_TAGS[number];

// ============================================================
// 입력 문자열 → 표준 태그 매핑 (규칙 기반)
// ============================================================
// 컬렉터가 정책을 수집할 때 제목·설명·해시태그를 이 함수로 정규화.
// 정규식 기반 룰 매칭만 수행 (LLM 호출 없음). 빠르고 결정적이라 운영에 충분.

// 지역명 정규화 (도 단위)
// 예: "서울특별시", "서울시", "서울" → "서울"
//     "경기도", "경기" → "경기"
const REGION_ALIASES: Record<string, RegionTag> = {
  "서울특별시": "서울", "서울시": "서울", "서울": "서울",
  "부산광역시": "부산", "부산시": "부산", "부산": "부산",
  "대구광역시": "대구", "대구시": "대구", "대구": "대구",
  "인천광역시": "인천", "인천시": "인천", "인천": "인천",
  "광주광역시": "광주", "광주시": "광주", "광주": "광주",
  "대전광역시": "대전", "대전시": "대전", "대전": "대전",
  "울산광역시": "울산", "울산시": "울산", "울산": "울산",
  "세종특별자치시": "세종", "세종시": "세종", "세종": "세종",
  "경기도": "경기", "경기": "경기",
  "강원도": "강원", "강원특별자치도": "강원", "강원": "강원",
  "충청북도": "충북", "충북": "충북",
  "충청남도": "충남", "충남": "충남",
  "전라북도": "전북", "전북특별자치도": "전북", "전북": "전북",
  "전라남도": "전남", "전남": "전남",
  "경상북도": "경북", "경북": "경북",
  "경상남도": "경남", "경남": "경남",
  "제주특별자치도": "제주", "제주도": "제주", "제주": "제주",
  "전국": "전국", "중앙": "전국",
};

// 문자열에서 지역 태그를 추출 (광역시 단위까지)
export function extractRegionTags(text: string | null | undefined): RegionTag[] {
  if (!text) return [];
  const found = new Set<RegionTag>();
  for (const [alias, tag] of Object.entries(REGION_ALIASES)) {
    if (text.includes(alias)) found.add(tag);
  }
  return Array.from(found);
}

// 연령 추출 규칙
export function extractAgeTags(text: string | null | undefined): AgeTag[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const found = new Set<AgeTag>();
  if (/영유아|신생아|0~?\d세|0세 ~|유아/i.test(text)) found.add("영유아");
  if (/초등|중학|고등|학생|재학/i.test(text)) found.add("학생");
  if (/청년|19\s*~\s*39|20대|30대|사회초년|구직자|취업준비/i.test(text)) found.add("청년");
  if (/중장년|40대|50대|장년/i.test(text)) found.add("중장년");
  if (/노년|노인|고령|65세|어르신|은퇴|노후/i.test(text)) found.add("노년");
  if (t.includes("전연령") || t.includes("누구나") || t.includes("제한없음")) found.add("전연령");
  return Array.from(found);
}

// 업종·직업 추출
export function extractOccupationTags(text: string | null | undefined): OccupationTag[] {
  if (!text) return [];
  const found = new Set<OccupationTag>();
  if (/소상공인/.test(text)) found.add("소상공인");
  if (/자영업/.test(text)) found.add("자영업자");
  if (/직장인|근로자|임금근로/.test(text)) found.add("직장인");
  if (/구직자|실업자|미취업/.test(text)) found.add("구직자");
  if (/대학생|대학원생/.test(text)) found.add("대학생");
  if (/주부|가정|전업주부/.test(text)) found.add("주부");
  if (/농민|어민|농업인|어업인|농어민/.test(text)) found.add("농어민");
  if (/프리랜서|특수고용|1인 사업자|1인 미디어/.test(text)) found.add("프리랜서");
  if (/창업|예비 ?창업|스타트업/.test(text)) found.add("창업자");
  return Array.from(found);
}

// 혜택 분야 추출 (기존 mapWelfareCategory 확장)
export function extractBenefitTags(text: string | null | undefined): BenefitTag[] {
  if (!text) return [];
  const found = new Set<BenefitTag>();
  if (/주거|임대|월세|주택|전세|보증금|공공임대|임차/.test(text)) found.add("주거");
  if (/의료|건강|병원|진료|건강검진|의료비|건강보험|치료/.test(text)) found.add("의료");
  if (/양육|보육|출산|아동|임산부|어린이집|유아|출생|산후/.test(text)) found.add("양육");
  if (/교육|학자금|장학|학습|교육비|진학/.test(text)) found.add("교육");
  if (/문화|여가|체육|공연|관광/.test(text)) found.add("문화");
  if (/취업|일자리|고용|구직|직업훈련|인턴/.test(text)) found.add("취업");
  if (/창업|스타트업|벤처|기업가|사업 ?자금/.test(text)) found.add("창업");
  if (/대출|보증|금융|이자|저축|자금 지원/.test(text)) found.add("금융");
  // 2026-04-25 보강: emergency·재난·위기 정책 흡수 (사용자 핫토픽 요청)
  // "긴급지원"·"재난지원금"·"위기가구" 같은 표현이 정책명에 자주 나옴.
  // 이들은 모두 생계 지원 성격이라 별도 태그 X, 기존 "생계"에 합산.
  if (/생계|기초수급|차상위|생활비|긴급지원|긴급재난|긴급복지|위기가구|재난지원금|특별재난/.test(text)) found.add("생계");
  // 2026-04-25 보강: 고유가·유가·기름값 — 유류세·유가환급·운송업 유류비 지원 등이
  // "에너지" 정책 범주로 자주 나옴. 기존 "에너지" 태그에 흡수.
  if (/에너지|전기|가스|난방|등유|연료|고유가|유가|유류|기름값|휘발유|경유/.test(text)) found.add("에너지");
  if (/교통|대중교통|버스|지하철|택시/.test(text)) found.add("교통");
  if (/장례|사망|장제/.test(text)) found.add("장례");
  if (/법률|변호|소송|조정/.test(text)) found.add("법률");
  if (found.size === 0) found.add("기타");
  return Array.from(found);
}

// 가구·개인 상태 추출
export function extractHouseholdTags(text: string | null | undefined): HouseholdTag[] {
  if (!text) return [];
  const found = new Set<HouseholdTag>();
  if (/1인 ?가구|독거/.test(text)) found.add("1인가구");
  if (/신혼|결혼/.test(text)) found.add("신혼부부");
  if (/한부모|미혼모|미혼부/.test(text)) found.add("한부모");
  if (/다자녀|세 ?자녀 이상/.test(text)) found.add("다자녀");
  if (/다문화|외국인|이주/.test(text)) found.add("다문화");
  if (/저소득|기초수급|차상위|기초생활/.test(text)) found.add("저소득");
  if (/장애인|장애/.test(text)) found.add("장애인");
  if (/국가유공자|보훈/.test(text)) found.add("국가유공자");
  if (found.size === 0) found.add("일반");
  return Array.from(found);
}
