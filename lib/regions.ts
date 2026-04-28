// ============================================================
// 대한민국 행정구역 — 17 광역 + 228 시군구
// ============================================================
// 2024년 행정안전부 기준 (군위군 2023-07 대구광역시 편입 반영).
// 네이버 뉴스 검색 매트릭스 ("광역명 시군구명 + 키워드") 의 단위로 사용.
//
// 광역별 cron 17개로 분할 처리 — 단일 cron 으로 (광역 17 + 시군구 228) ×
// 18 키워드 = 4,374회 호출은 Vercel maxDuration 5분(300s) 한참 초과
// (~22분 예상). 광역별로 cron 분리해서 가장 큰 경기도 (32 단위 × 18 ×
// 0.3s = 173s) 도 한도 안에 들어옴.
//
// province 의 짧은 영문 코드 (seoul, jeonnam 등) 가 dynamic route 의
// path param. 한글 광역명 그대로 path 에 못 쓰니 매핑 필요.
// ============================================================

export const PROVINCES = [
  { code: "seoul", name: "서울특별시" },
  { code: "busan", name: "부산광역시" },
  { code: "daegu", name: "대구광역시" },
  { code: "incheon", name: "인천광역시" },
  { code: "gwangju", name: "광주광역시" },
  { code: "daejeon", name: "대전광역시" },
  { code: "ulsan", name: "울산광역시" },
  { code: "sejong", name: "세종특별자치시" },
  { code: "gyeonggi", name: "경기도" },
  { code: "gangwon", name: "강원특별자치도" },
  { code: "chungbuk", name: "충청북도" },
  { code: "chungnam", name: "충청남도" },
  { code: "jeonbuk", name: "전북특별자치도" },
  { code: "jeonnam", name: "전라남도" },
  { code: "gyeongbuk", name: "경상북도" },
  { code: "gyeongnam", name: "경상남도" },
  { code: "jeju", name: "제주특별자치도" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];

// 광역 → 그 광역 소속 시군구 목록.
// 세종특별자치시: 단일 광역시 (시군구 없음, 광역=기초 통합) → 빈 배열.
// 제주특별자치도: 자치시 2개 (제주시·서귀포시) — 행정시이지만 검색 단위로 활용.
export const DISTRICTS_BY_PROVINCE: Record<ProvinceCode, string[]> = {
  seoul: [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구",
    "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구",
    "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구",
    "서초구", "강남구", "송파구", "강동구",
  ],
  busan: [
    "중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구",
    "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구",
    "기장군",
  ],
  daegu: [
    "중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군",
    "군위군", // 2023-07 경상북도에서 편입
  ],
  incheon: [
    "중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구",
    "강화군", "옹진군",
  ],
  gwangju: ["동구", "서구", "남구", "북구", "광산구"],
  daejeon: ["동구", "중구", "서구", "유성구", "대덕구"],
  ulsan: ["중구", "남구", "동구", "북구", "울주군"],
  sejong: [], // 광역=기초 통합
  gyeonggi: [
    "수원시", "고양시", "용인시", "성남시", "부천시", "화성시", "안산시",
    "남양주시", "안양시", "평택시", "의정부시", "시흥시", "파주시", "김포시",
    "광명시", "광주시", "군포시", "하남시", "오산시", "양주시", "이천시",
    "구리시", "안성시", "포천시", "의왕시", "여주시", "동두천시", "과천시",
    "양평군", "가평군", "연천군",
  ],
  gangwon: [
    "춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시",
    "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군",
    "양구군", "인제군", "고성군", "양양군",
  ],
  chungbuk: [
    "청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군",
    "진천군", "괴산군", "음성군", "단양군",
  ],
  chungnam: [
    "천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시",
    "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군",
    "태안군",
  ],
  jeonbuk: [
    "전주시", "군산시", "익산시", "정읍시", "남원시", "김제시",
    "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군",
    "부안군",
  ],
  jeonnam: [
    "목포시", "여수시", "순천시", "나주시", "광양시",
    "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군",
    "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군",
    "완도군", "진도군", "신안군",
  ],
  gyeongbuk: [
    "포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시",
    "상주시", "문경시", "경산시",
    "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군",
    "칠곡군", "예천군", "봉화군", "울진군", "울릉군",
  ],
  gyeongnam: [
    "창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시",
    "양산시",
    "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군",
    "함양군", "거창군", "합천군",
  ],
  jeju: ["제주시", "서귀포시"],
};

// 광역명 → 광역 코드 (역방향 매핑)
export function getProvinceByCode(code: string): { code: ProvinceCode; name: string } | null {
  const found = PROVINCES.find((p) => p.code === code);
  return found ? { code: found.code, name: found.name } : null;
}

// 한 광역의 검색 단위 = [광역명, ...시군구]. 광역명 자체도 검색 키워드의 일부.
// 예: 전라남도 → ["전라남도", "목포시", "여수시", "순천시", ...]
export function getSearchUnitsForProvince(code: ProvinceCode): string[] {
  const province = PROVINCES.find((p) => p.code === code);
  if (!province) return [];
  const districts = DISTRICTS_BY_PROVINCE[code] ?? [];
  // 시군구 검색 시 "전라남도 순천시" 처럼 광역+시군구 조합으로 정확도 ↑.
  // (단순 "순천시" 만으로는 다른 지역의 동명 시군구 또는 인명·기업명 오인 가능.)
  return [
    province.name,
    ...districts.map((d) => `${province.name} ${d}`),
  ];
}

// 광역 짧은 이름 ↔ 정식 광역명 매핑 — UI 드롭다운(짧은 이름) 과
// DB region 컬럼(정식 광역명) 의 형식 차이를 흡수.
//
// /welfare /loan 페이지의 region 필터가 "전남" 옵션 선택 시 DB region
// "전라남도" 와 매칭되도록 하는 변환표. 보건복지부 LocalGovernmentWelfare
// Informations 데이터는 ctpvNm = "전라남도" 형식으로 들어옴.
//
// "전남" 이 들어오면 ["전라남도", "전남"] 두 후보 모두로 ILIKE 매칭 →
// 광역만 저장된 row + 광역+시군구 저장된 row + 짧은 이름 저장된 row 모두 잡힘.
export const PROVINCE_SHORT_TO_FULL: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

// 짧은 이름 → ILIKE 매칭에 쓸 후보 배열. DB 에 다양한 형식이 섞여 있어도
// 모두 잡도록 정식 이름 + 짧은 이름 둘 다 후보로 반환.
export function getRegionMatchPatterns(shortName: string): string[] {
  const full = PROVINCE_SHORT_TO_FULL[shortName];
  if (!full) return [shortName];
  return [full, shortName];
}

// 광역 영문 코드 → 짧은 한글 이름. PROVINCE_SHORT_TO_FULL 의 역방향.
// /welfare/region/[code]·/loan/region/[code] 페이지가 path param 의 영문
// 코드(jeonnam)를 DB ilike 매칭에 잘 잡히는 짧은 이름(전남)으로 변환할 때 사용.
// 짧은 이름 매핑이 없으면 정식 광역명(getProvinceByCode 결과)으로 fallback.
export const PROVINCE_CODE_TO_SHORT: Record<ProvinceCode, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
};

// 광역별 cron 시간 매핑 — vercel.json 의 schedule 과 일치 (UTC 기준).
// 14:00 ~ 15:20, 5분 간격으로 분산 → 다른 cron (RSS 02:00, collect 04:00,
// enrich 03:00, cleanup 05:00, finalize 06:00, alert 07:00) 과 충돌 없음.
export const PROVINCE_CRON_SCHEDULE: Record<ProvinceCode, string> = {
  seoul: "0 14 * * *",
  busan: "5 14 * * *",
  daegu: "10 14 * * *",
  incheon: "15 14 * * *",
  gwangju: "20 14 * * *",
  daejeon: "25 14 * * *",
  ulsan: "30 14 * * *",
  sejong: "35 14 * * *",
  gyeonggi: "40 14 * * *",
  gangwon: "45 14 * * *",
  chungbuk: "50 14 * * *",
  chungnam: "55 14 * * *",
  jeonbuk: "0 15 * * *",
  jeonnam: "5 15 * * *",
  gyeongbuk: "10 15 * * *",
  gyeongnam: "15 15 * * *",
  jeju: "20 15 * * *",
};
