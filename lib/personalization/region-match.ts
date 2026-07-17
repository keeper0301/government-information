// lib/personalization/region-match.ts
// 정책 region/district 매칭 로직 — 5/17 f4 split.
// 이전 lib/personalization/score.ts (921줄) 안에 있던 region 매칭 함수들을
// 별도 파일로 분리. score.ts 의 cohort/income/scoring 과 별 관심사 (regional eligibility).
//
// 외부 import 처 (6 파일) 는 score.ts re-export 로 backward compat 유지.

import { PROVINCES, DISTRICTS_BY_PROVINCE } from '@/lib/regions';

// 광역시도 명칭 별칭 매핑 (DB에 저장된 정식 명칭 → 사용자 선택 짧은 명칭)
// 예: "서울특별시" → 사용자가 선택한 "서울"과 매칭되게 처리
// HomeRecommendAuto 의 pool 쿼리도 같은 별칭을 .or(ilike) 로 사용해 일관성 확보.
export const REGION_ALIASES: Record<string, string[]> = {
  '서울': ['서울특별시', '서울시', '서울'],
  '경기': ['경기도', '경기'],
  '인천': ['인천광역시', '인천시', '인천'],
  '부산': ['부산광역시', '부산시', '부산'],
  '대구': ['대구광역시', '대구시', '대구'],
  '광주': ['광주광역시', '광주시', '광주'],
  '대전': ['대전광역시', '대전시', '대전'],
  '울산': ['울산광역시', '울산시', '울산'],
  '세종': ['세종특별자치시', '세종시', '세종'],
  '강원': ['강원특별자치도', '강원도', '강원'],
  '충북': ['충청북도', '충북'],
  '충남': ['충청남도', '충남'],
  '전북': ['전북특별자치도', '전라북도', '전북'],
  '전남광주통합특별시': ['전남광주통합특별시', '광주·전남', '광주전남', '광주광역시', '광주시', '광주', '전라남도', '전남'],
  '광주·전남': ['전남광주통합특별시', '광주·전남', '광주전남', '광주광역시', '광주시', '광주', '전라남도', '전남'],
  '광주전남': ['전남광주통합특별시', '광주·전남', '광주전남', '광주광역시', '광주시', '광주', '전라남도', '전남'],
  '전남': ['전라남도', '전남'],
  '경북': ['경상북도', '경북'],
  '경남': ['경상남도', '경남'],
  '제주': ['제주특별자치도', '제주도', '제주'],
};

// 사용자 region 짧은 키 ('전남') → PROVINCES 의 ProvinceCode ('jeonnam') 매핑.
// "전남광주통합특별시" 같은 통합 권역은 여러 ProvinceCode 를 반환한다.
// REGION_ALIASES 의 키를 lib/regions.ts 의 PROVINCES.name 과 매칭해서 결정.
// 같은 매핑이 여러 함수에서 재사용되므로 캐시.
const _provinceCodesByUserRegion = new Map<string, string[]>();
function findProvinceCodesForUserRegion(userRegion: string): string[] {
  const cached = _provinceCodesByUserRegion.get(userRegion);
  if (cached) return cached;
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  const matched: string[] = [];
  for (const province of PROVINCES) {
    if (aliases.some((a) => province.name.includes(a) || a.includes(province.name))) {
      matched.push(province.code);
    }
  }
  _provinceCodesByUserRegion.set(userRegion, matched);
  return matched;
}

// 사용자 region 외 다른 광역명 + 다른 광역의 시군구 (동명 시군구 제외) set.
// 정책 title 에 이 키워드 중 하나라도 포함돼 있으면 "다른 지역 정책" 으로 간주 → 추천 차단.
//
// 사고 (2026-05-07): 사장님(전남 순천) 화면에 "2025 속초시 출연 소상공인 협약보증" 표시.
// 정책 region 컬럼이 NULL 또는 잘못 저장돼 evaluateRegion 의 gate 우회 → benefit_tags
// 다른 시그널 합산만으로 minScore 통과. title 에 "속초시" 명시되어 있어도 못 잡음.
//
// hot-fix: title 에 다른 광역의 시군구·광역명이 명시되면 region 정보 무시하고 강제 차단.
//
// **중요한 회귀 방지**: 동명 시군구 (강서구 서울/부산, 동구·중구·서구·남구·북구 다수, 고성군 강원/경남
// 등) 는 conflict set 에서 제외. 사용자 광역에도 같은 이름 시군구가 있으면 그 키워드 단독으로는
// 차단 안 함. 트레이드오프: 진짜 다른 광역의 동명 시군구 정책은 못 잡지만(false negative),
// 자기 광역 정책이 잘못 차단되는 회귀(false positive)는 0 — 자기 지역 정책 차단이 더 큰 사고.
const _conflictKeywordsByUserRegion = new Map<string, Set<string>>();
function getConflictingRegionKeywords(userRegion: string): Set<string> {
  const cached = _conflictKeywordsByUserRegion.get(userRegion);
  if (cached) return cached;

  const userProvinceCodes = new Set(findProvinceCodesForUserRegion(userRegion));
  const userDistricts = new Set<string>(
    [...userProvinceCodes].flatMap(
      (code) => DISTRICTS_BY_PROVINCE[code as keyof typeof DISTRICTS_BY_PROVINCE] ?? [],
    ),
  );

  // 동명 시군구 검출용 — 한국 전역에서 2개 이상 광역에 등장하는 시군구 이름.
  // 사용자 광역 외에 여러 광역에 등장하는 이름은 단독으로는 conflict 처리하지 않음.
  const districtCounts = new Map<string, number>();
  for (const province of PROVINCES) {
    for (const district of DISTRICTS_BY_PROVINCE[province.code] ?? []) {
      districtCounts.set(district, (districtCounts.get(district) ?? 0) + 1);
    }
  }

  const result = new Set<string>();

  for (const province of PROVINCES) {
    const isUserProvince = userProvinceCodes.has(province.code);
    if (isUserProvince) continue; // 사용자 광역·그 시군구는 conflict 아님

    // 다른 광역의 정식 명칭 (예: "강원특별자치도", "전라북도") — 길고 명확해서 false positive ↓
    result.add(province.name);

    // 다른 광역의 시군구 — 동명·자기 광역 중복은 제외
    const districts = DISTRICTS_BY_PROVINCE[province.code] ?? [];
    for (const district of districts) {
      // 사용자 광역에 같은 이름 시군구 있으면 단독 키워드로 차단 안 함 (회귀 방지)
      if (userDistricts.has(district)) continue;
      // 한국 전역에서 동명 시군구 (강서구·동구·중구·고성군 등) 도 단독 차단 안 함
      // — 광역 한정자 없이 단순 substring 매칭은 false positive 위험
      if ((districtCounts.get(district) ?? 0) > 1) continue;
      result.add(district);
    }
  }

  _conflictKeywordsByUserRegion.set(userRegion, result);
  return result;
}

/**
 * 정책 title 에 사용자 광역과 다른 광역/시군구가 명시되어 있는지 검사.
 * true 면 추천에서 강제 차단해야 함 (region 컬럼 데이터 오류 안전망).
 *
 * 같은 광역 내 다른 시군구 (예: 사장님 순천시 + 영암군 정책) 는 evaluateRegion 의
 * district_mismatch 가 이미 잡으므로 여기서 추가로 처리 안 함.
 */
export function hasConflictingRegionInTitle(title: string, userRegion: string): boolean {
  const conflicts = getConflictingRegionKeywords(userRegion);
  for (const keyword of conflicts) {
    if (title.includes(keyword)) return true;
  }
  return false;
}

// 정책 지역 평가 결과
// - national: 전국 정책 → +5
// - region_sub_district: 광역 + 시군구 + 읍·면·동·리 정확 매칭 → +20 (Phase B 5/20)
// - region_district: 광역 + 시군구 정확 매칭 → +10 (광역 5 + 시군구 5)
// - region_only: 광역만 매칭 (정책에 시군구 명시 없음) → +5
// - district_mismatch: 같은 광역인데 다른 시군구 → 0 (영암군 정책에 순천시 사용자 매칭 차단)
// - no_match: 다른 광역 또는 정보 없음 → 0
export type RegionMatchResult =
  | { kind: 'national'; score: 5 }
  | { kind: 'region_sub_district'; score: 20 }
  | { kind: 'region_district'; score: 10 }
  | { kind: 'region_only'; score: 5 }
  | { kind: 'district_mismatch'; score: 0 }
  | { kind: 'no_match'; score: 0 };

// 정책 지역과 사용자 지역의 정합성을 평가.
// welfare_programs.region 컬럼이 "전라남도 영암군" 같이 시군구를 포함한 한 문자열이라
// 사용자 district 도 substring 으로 검출해서 같은 시군구인지·다른 시군구인지 구분.
//
// 2026-05-16 — programDistrict 인자 신설 (migration 090).
//   - district 컬럼이 자동 추출되어 있으면 substring 매칭보다 정확.
//   - userDistrict === programDistrict → region_district (+10) 즉시 반환.
//   - 기존 substring 매칭은 fallback (district 컬럼 NULL 인 row).
export function evaluateRegion(
  programRegion: string | null | undefined,
  userRegion: string | null,
  userDistrict: string | null,
  programDistrict?: string | null,
  // 2026-05-20 Phase B — sub_district (읍·면·동·리) 단위 정확 매칭 시 +20.
  // welfare/loan/news 에 sub_district 컬럼 추가 + 백필 (다음 step) 후 발현.
  // 지금은 program.sub_district 가 NULL 이라 기존 동작 그대로.
  userSubDistrict?: string | null,
  programSubDistrict?: string | null,
): RegionMatchResult {
  if (!programRegion && !programDistrict) return { kind: 'no_match', score: 0 };
  // 사용자 region 미설정 → 어떤 매칭도 안 함 (기존 동작 유지: 빈 프로필은 추천 풀에 진입 못 함)
  if (!userRegion) return { kind: 'no_match', score: 0 };
  // "전국" 키워드 포함 시 사용자 광역 무관하게 매칭
  if (programRegion && programRegion.includes('전국')) return { kind: 'national', score: 5 };

  // 사용자 광역 별칭이 정책 region 에 포함되는지 (district 컬럼이 우선이지만 region 도 같이 검증)
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  const regionHit = programRegion ? aliases.some((a) => programRegion.includes(a)) : false;

  // ── district 정확 매칭 (programDistrict 컬럼) ──────────────────
  // 동명 시·군 사고 (중구·동구·서구·남구·북구·고성군 — 광역 다수) 차단 위해
  // district 정확 매칭이라도 광역 검증 같이.
  //  - program.region 명시 + 사용자 광역 일치 → 정확 (+10)
  //  - program.region 명시 + 사용자 광역 불일치 → no_match (차단)
  //  - program.region NULL → 광역 모호 — district 가 unique 한 시·군이면 안전,
  //    그렇지 않으면 위험. 단순화: region NULL 이면 정확 매칭 거부 (다음 단계로).
  if (userDistrict && programDistrict && userDistrict === programDistrict) {
    if (programRegion && regionHit) {
      // 2026-05-20 Phase B — district 일치 + sub_district 도 일치하면 정확도 ↑ +20.
      // userSubDistrict NULL 또는 programSubDistrict NULL 이면 기존 region_district +10.
      if (
        userSubDistrict &&
        programSubDistrict &&
        userSubDistrict === programSubDistrict
      ) {
        return { kind: 'region_sub_district', score: 20 };
      }
      return { kind: 'region_district', score: 10 };
    }
    if (!programRegion) {
      // 광역 정보 없음 — district 단독 정확 매칭은 동명 시·군 사고 risk.
      // 일반 region substring 매칭 단계로 진행하면 어차피 no_match (region NULL).
      // 안전한 fallback: no_match.
      return { kind: 'no_match', score: 0 };
    }
    // programRegion 있지만 사용자 광역과 불일치 — district 동명이지만 다른 광역
    return { kind: 'no_match', score: 0 };
  }

  // 광역 매칭 실패 (programDistrict 도 다른 시·군이면 다른 광역의 정책일 가능성)
  if (!regionHit) return { kind: 'no_match', score: 0 };

  // 사용자가 시군구 미선택 → 광역 매칭으로 충분
  if (!userDistrict) return { kind: 'region_only', score: 5 };

  // programDistrict 가 명시되어 있는데 사용자와 다름 → 다른 시·군 정책
  if (programDistrict && programDistrict !== userDistrict) {
    return { kind: 'district_mismatch', score: 0 };
  }

  // 정책 region 에 사용자 district 직접 포함 → 정확 매칭 (+10) (기존 fallback)
  if (programRegion && programRegion.includes(userDistrict)) {
    return { kind: 'region_district', score: 10 };
  }

  // 정책 region 에서 광역 별칭 제거 후 남는 부분에 다른 시군구가 명시돼 있는지 검사.
  // 별칭 길이 내림차순으로 strip 해야 "서울특별시" 가 "서울" 보다 먼저 제거되어
  // "특별시" 잔재가 시군구로 잘못 인식되는 문제 방지.
  // 예: "전라남도 영암군" → strip "전라남도" → "영암군" → /시|군|구/ 매칭 → 다른 시군구 명시.
  // "전라남도" → strip → "" → 다른 시군구 명시 없음 → region_only.
  // programRegion 이 null 인 케이스는 위에서 regionHit false → no_match 로 이미 return.
  if (programRegion) {
    const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
    const stripped = sortedAliases
      .reduce((s, a) => s.replace(a, ''), programRegion)
      .trim();
    const hasOtherDistrict = /\S(시|군|구)(\s|$)/.test(stripped);
    if (hasOtherDistrict) {
      // 같은 광역이지만 다른 시군구가 명시됨 → 사용자에게 부적합
      return { kind: 'district_mismatch', score: 0 };
    }
  }

  // 광역만 명시된 정책 (시군구 명시 없음) → 광역 매칭으로 처리
  return { kind: 'region_only', score: 5 };
}
