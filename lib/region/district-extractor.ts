// ============================================================
// 정책 텍스트에서 시·군 자동 추출
// ============================================================
// welfare/loan/news/press_ingest 의 title/content/source 에서 시·군 (예:
// "순천시", "여수시") 을 자동 검출 → district 컬럼 백필.
//
// 광역 region 컬럼만 ("전라남도") 으로는 시·군 단위 추천 못 함. 사장님
// (전남 순천) 처럼 거주지 정책 받으려면 district 필요.
//
// 정확도 우선순위:
//   1) "전라남도 순천시" 같은 광역+시·군 명시 → 광역 일치 + 시·군 정확
//   2) 광역 없이 "순천시" 만 → 첫 match province 사용 (동명 시·군 대비)
//   3) 매치 X → null (전국 정책 또는 분류 안 됨)
//
// 동명 시·군 사고 (예: "동구·중구·서구·남구·북구") 회피:
//   - 광역 명시 있으면 그 광역의 시·군 우선
//   - 광역 없으면 PROVINCES 순서 첫 match (수도권 우선)
// ============================================================

import {
  PROVINCES,
  DISTRICTS_BY_PROVINCE,
  type ProvinceCode,
} from "@/lib/regions";

export type DistrictMatch = {
  province: ProvinceCode;
  provinceName: string;
  district: string;
};

// 광역명 변형 (긴 형태·짧은 형태). text 안에 substring 검출 시 사용.
// 예: "전라남도" 또는 "전남" 둘 다 jeonnam 매칭.
// 2026-05-31 District Phase C — 변형 alias 보강 (강원자치도·전북자치도·전남도 등).
// 일부 정책 본문은 "강원특별자치도" 대신 짧은 "강원자치도" 사용.
const PROVINCE_ALIASES: Record<ProvinceCode, string[]> = {
  seoul: ["서울특별시", "서울시", "서울"],
  incheon: ["인천광역시", "인천시", "인천"],
  gyeonggi: ["경기도", "경기"],
  gangwon: ["강원특별자치도", "강원자치도", "강원도", "강원"],
  daejeon: ["대전광역시", "대전시", "대전"],
  sejong: ["세종특별자치시", "세종시", "세종"],
  chungbuk: ["충청북도", "충북"],
  chungnam: ["충청남도", "충남"],
  gwangju: ["광주광역시", "광주시", "광주"],
  jeonbuk: ["전북특별자치도", "전북자치도", "전라북도", "전북"],
  jeonnam: ["전라남도", "전남도", "전남"],
  busan: ["부산광역시", "부산시", "부산"],
  daegu: ["대구광역시", "대구시", "대구"],
  ulsan: ["울산광역시", "울산시", "울산"],
  gyeongbuk: ["경상북도", "경북"],
  gyeongnam: ["경상남도", "경남"],
  jeju: ["제주특별자치도", "제주자치도", "제주도", "제주"],
};

// text 안 광역 검출. 가장 긴 alias 부터 매칭 (전라남도 > 전남 우선).
export function detectProvince(text: string): ProvinceCode | null {
  const t = text.toLowerCase();
  // 가장 긴 alias 부터 우선 — "전라남도" 가 "전남" 보다 먼저.
  const flat: Array<{ code: ProvinceCode; alias: string }> = [];
  for (const province of PROVINCES) {
    for (const a of PROVINCE_ALIASES[province.code]) {
      flat.push({ code: province.code, alias: a });
    }
  }
  flat.sort((a, b) => b.alias.length - a.alias.length);
  for (const { code, alias } of flat) {
    if (t.includes(alias.toLowerCase())) return code;
  }
  return null;
}

// 가장 긴 district 부터 정렬 — "강서구" 가 "서구" 보다 먼저 매칭되도록.
// substring 검출이라 짧은 이름 ("서구") 이 긴 이름 ("강서구") 안에 포함됨.
function sortedDistricts(province: ProvinceCode): string[] {
  return (DISTRICTS_BY_PROVINCE[province] ?? [])
    .slice()
    .sort((a, b) => b.length - a.length);
}

// text 안에서 (광역 + 시·군) 자동 추출. 정확도 순으로 시도.
export function extractDistrict(text: string | null | undefined): DistrictMatch | null {
  if (!text) return null;
  const t = text;

  const detectedProvince = detectProvince(t);

  // Case 1: 광역 명시 + 그 광역의 시·군 매칭 시도 (가장 긴 이름 우선)
  if (detectedProvince) {
    for (const d of sortedDistricts(detectedProvince)) {
      if (t.includes(d)) {
        return {
          province: detectedProvince,
          provinceName: PROVINCES.find((p) => p.code === detectedProvince)!.name,
          district: d,
        };
      }
    }
  }

  // Case 2: 광역 없이 시·군만 → PROVINCES 순서 첫 match. 각 광역 안에서도
  // 가장 긴 이름 우선. 동명 시·군 (강서구·동구 등) 은 수도권 우선.
  for (const province of PROVINCES) {
    for (const d of sortedDistricts(province.code)) {
      if (t.includes(d)) {
        return {
          province: province.code,
          provinceName: province.name,
          district: d,
        };
      }
    }
  }

  return null;
}

// ============================================================
// 2026-05-20 District Phase B — 읍·면·동·리 단위 매칭
// ============================================================
// DDL 097 district_dictionary 와 별도로 코드 inline (동기 함수 유지 + 핵심 데이터 fast).
// DB 의 district_dictionary 는 사용자 입력 form 의 lookup + 미래 확장용.
// 매칭 우선: 가장 긴 sub_district 부터 (substring 사고 회피 — "매월리" > "매월").
//
// 데이터 source: 사장님 거주지 (전남 순천) 우선 + 다른 도시는 점차 확장.
// ============================================================

export type SubDistrictType = "eup" | "myeon" | "dong" | "ri";

export type SubDistrictMatch = DistrictMatch & {
  subDistrict: string;
  subType: SubDistrictType;
};

// province + district 별 sub_district 목록. 가장 긴 이름 우선 (substring 사고 회피).
// 5/20 — 전남 순천 28 읍·면·동 + 6 법정리 (사장님 거주지). 다른 도시 점차 확장.
const SUB_DISTRICT_DATA: Record<string, Array<{ sub: string; type: SubDistrictType }>> = {
  "jeonnam|순천시": [
    // 1읍
    { sub: "승주읍", type: "eup" },
    // 10면
    { sub: "해룡면", type: "myeon" },
    { sub: "서면", type: "myeon" },
    { sub: "황전면", type: "myeon" },
    { sub: "월등면", type: "myeon" },
    { sub: "주암면", type: "myeon" },
    { sub: "송광면", type: "myeon" },
    { sub: "외서면", type: "myeon" },
    { sub: "낙안면", type: "myeon" },
    { sub: "별량면", type: "myeon" },
    { sub: "상사면", type: "myeon" },
    // 12동
    { sub: "향동", type: "dong" },
    { sub: "매곡동", type: "dong" },
    { sub: "삼산동", type: "dong" },
    { sub: "조곡동", type: "dong" },
    { sub: "덕연동", type: "dong" },
    { sub: "풍덕동", type: "dong" },
    { sub: "남제동", type: "dong" },
    { sub: "저전동", type: "dong" },
    { sub: "장천동", type: "dong" },
    { sub: "중앙동", type: "dong" },
    { sub: "도사동", type: "dong" },
    { sub: "왕지동", type: "dong" },
    // 사장님 거주지 월등면 법정리
    { sub: "매월리", type: "ri" },
    { sub: "신성리", type: "ri" },
    { sub: "월용리", type: "ri" },
    { sub: "계월리", type: "ri" },
    { sub: "대평리", type: "ri" },
    { sub: "대광리", type: "ri" },
  ],
};

const SUB_DISTRICT_TYPE_RANK: Record<SubDistrictType, number> = {
  ri: 4,
  dong: 3,
  eup: 2,
  myeon: 2,
};

/**
 * text 안에서 sub_district (읍·면·동·리) 매칭. district 단위 매칭 이후 호출.
 * district 가 jeonnam 순천시 라면 SUB_DISTRICT_DATA["jeonnam|순천시"] 안 검색.
 *
 * substring 사고 회피 — 가장 긴 sub 부터 우선 ("매월리" 가 "매월" 보다 먼저).
 */
export function extractSubDistrict(
  text: string | null | undefined,
  match: DistrictMatch,
): SubDistrictMatch | null {
  if (!text) return null;
  const key = `${match.province}|${match.district}`;
  const subs = SUB_DISTRICT_DATA[key];
  if (!subs) return null;

  // 가장 긴 sub 우선. 길이가 같으면 실제 주소에서 더 세부적인 단위를 먼저 잡는다.
  const sorted = subs
    .slice()
    .sort(
      (a, b) =>
        b.sub.length - a.sub.length ||
        SUB_DISTRICT_TYPE_RANK[b.type] - SUB_DISTRICT_TYPE_RANK[a.type],
    );
  for (const { sub, type } of sorted) {
    if (text.includes(sub)) {
      return {
        ...match,
        subDistrict: sub,
        subType: type,
      };
    }
  }
  return null;
}

// 여러 텍스트 (title + content + source) 조합에서 추출. 첫 정확 match 반환.
// 광역 명시 텍스트가 있으면 그것이 우선.
export function extractDistrictFromFields(
  ...fields: Array<string | null | undefined>
): DistrictMatch | null {
  // 광역 명시 텍스트 우선 (Case 1 매칭 가능성 ↑)
  const withProvince: string[] = [];
  const withoutProvince: string[] = [];
  for (const f of fields) {
    if (!f) continue;
    if (detectProvince(f)) withProvince.push(f);
    else withoutProvince.push(f);
  }
  for (const f of [...withProvince, ...withoutProvince]) {
    const match = extractDistrict(f);
    if (match) return match;
  }
  return null;
}

export function extractSubDistrictFromFields(
  ...fields: Array<string | null | undefined>
): SubDistrictMatch | null {
  const districtMatch = extractDistrictFromFields(...fields);
  if (!districtMatch) return null;

  const combined = fields.filter((f): f is string => !!f).join(" ");
  return extractSubDistrict(combined, districtMatch);
}
