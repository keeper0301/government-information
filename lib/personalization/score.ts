// lib/personalization/score.ts
// 정책 1건이 사용자 프로필에 얼마나 맞는지 점수 계산
// spec §4-2 (Phase 1) 기준. 소득·가구상태는 본문 정규식 매칭으로 약한 가산점.
import { AGE_KEYWORDS, OCCUPATION_KEYWORDS } from '@/lib/profile-options';
import { evaluateBusinessMatch } from '@/lib/eligibility/business-match';
import type { UserSignals, MatchSignal, ScoredItem } from './types';

// 점수 계산 대상 아이템 형태 정의
// welfare/loan/news 등 여러 영역에서 공통으로 사용 가능
export type ScorableItem = {
  id: string;
  title: string;
  description?: string | null;
  region?: string | null;
  district?: string | null;
  benefit_tags?: string[] | null;
  apply_end?: string | null;
  source?: string | null;
  // Phase 1.5: 정확 매칭 데이터 (extractTargeting 결과가 저장된 컬럼)
  income_target_level?: 'low' | 'mid_low' | 'mid' | 'any' | null;
  household_target_tags?: string[] | null;
};

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
  '전남': ['전라남도', '전남'],
  '경북': ['경상북도', '경북'],
  '경남': ['경상남도', '경남'],
  '제주': ['제주특별자치도', '제주도', '제주'],
};

// 저소득 관련 키워드 목록
// 소득 수준이 낮은 사용자에게 관련 정책 가산점 부여용
const INCOME_KEYWORDS_LOW = ['기준중위소득', '차상위', '기초생활', '저소득'];

// 가구 유형 코드 → 본문 검색 키워드 매핑
// DB에서 사용하는 영문 코드를 실제 정책 본문에 나오는 한국어로 변환
const HOUSEHOLD_KEYWORDS: Record<string, string[]> = {
  'single_parent':    ['한부모', '한부모가정', '한부모가족'],  // 한부모 가정
  'multi_child':      ['다자녀', '셋째', '3자녀'],             // 다자녀 가정
  'married':          ['신혼', '신혼부부'],                    // 신혼부부
  'disabled_family':  ['장애', '장애인', '장애인가구'],         // 장애인 가구
  'elderly_family':   ['독거노인', '고령가구', '경로'],         // 노인 가구
  'single':           ['1인가구', '독거'],                     // 1인 가구
};

// 정책 지역 평가 결과
// - national: 전국 정책 → +5
// - region_district: 광역 + 시군구 정확 매칭 → +10 (광역 5 + 시군구 5)
// - region_only: 광역만 매칭 (정책에 시군구 명시 없음) → +5
// - district_mismatch: 같은 광역인데 다른 시군구 → 0 (영암군 정책에 순천시 사용자 매칭 차단)
// - no_match: 다른 광역 또는 정보 없음 → 0
type RegionMatchResult =
  | { kind: 'national'; score: 5 }
  | { kind: 'region_district'; score: 10 }
  | { kind: 'region_only'; score: 5 }
  | { kind: 'district_mismatch'; score: 0 }
  | { kind: 'no_match'; score: 0 };

// 정책 지역과 사용자 지역의 정합성을 평가.
// welfare_programs.region 컬럼이 "전라남도 영암군" 같이 시군구를 포함한 한 문자열이라
// 사용자 district 도 substring 으로 검출해서 같은 시군구인지·다른 시군구인지 구분.
function evaluateRegion(
  programRegion: string | null | undefined,
  userRegion: string | null,
  userDistrict: string | null,
): RegionMatchResult {
  if (!programRegion) return { kind: 'no_match', score: 0 };
  // 사용자 region 미설정 → 어떤 매칭도 안 함 (기존 동작 유지: 빈 프로필은 추천 풀에 진입 못 함)
  if (!userRegion) return { kind: 'no_match', score: 0 };
  // "전국" 키워드 포함 시 사용자 광역 무관하게 매칭
  if (programRegion.includes('전국')) return { kind: 'national', score: 5 };

  // 사용자 광역 별칭이 정책 region 에 포함되는지
  const aliases = REGION_ALIASES[userRegion] ?? [userRegion];
  const regionHit = aliases.some((a) => programRegion.includes(a));
  if (!regionHit) return { kind: 'no_match', score: 0 };

  // 사용자가 시군구 미선택 → 광역 매칭으로 충분
  if (!userDistrict) return { kind: 'region_only', score: 5 };

  // 정책 region 에 사용자 district 직접 포함 → 정확 매칭 (+10)
  if (programRegion.includes(userDistrict)) {
    return { kind: 'region_district', score: 10 };
  }

  // 정책 region 에서 광역 별칭 제거 후 남는 부분에 다른 시군구가 명시돼 있는지 검사.
  // 별칭 길이 내림차순으로 strip 해야 "서울특별시" 가 "서울" 보다 먼저 제거되어
  // "특별시" 잔재가 시군구로 잘못 인식되는 문제 방지.
  // 예: "전라남도 영암군" → strip "전라남도" → "영암군" → /시|군|구/ 매칭 → 다른 시군구 명시.
  // "전라남도" → strip → "" → 다른 시군구 명시 없음 → region_only.
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
  const stripped = sortedAliases
    .reduce((s, a) => s.replace(a, ''), programRegion)
    .trim();
  const hasOtherDistrict = /\S(시|군|구)(\s|$)/.test(stripped);
  if (hasOtherDistrict) {
    // 같은 광역이지만 다른 시군구가 명시됨 → 사용자에게 부적합
    return { kind: 'district_mismatch', score: 0 };
  }

  // 광역만 명시된 정책 (시군구 명시 없음) → 광역 매칭으로 처리
  return { kind: 'region_only', score: 5 };
}

// ============================================================
// Cohort 부적합 검출 — 정책 본문이 특정 인구 cohort 에만 의미 있는데
// 사용자가 그 cohort 에 속하지 않으면 점수 자체를 0 으로 만들어서 추천 풀에서 제외.
// (단순 가산점만으로는 "노인 보청기" 정책이 30대에게도 region 점수만으로 통과하는 문제 해결)
// ============================================================

// 노년층 cohort — 사용자가 60대 이상 ageGroup 이거나 elderly_family 가구일 때만 통과
const ELDERLY_COHORT_KEYWORDS: RegExp[] = [
  /노인(?!\s*돌봄)/, // "노인" (단 "노인 돌봄" 같은 양육자 정책 일부 회피)
  /어르신/,
  /경로(당|식|우대)/,
  /고령자/,
  /만\s*65세\s*이상/,
  /실버\s*세대/,
  /노년/,
  /기초연금/,
  /보청기/,
  /틀니/,
];

// 결혼이주·다문화 cohort — 현재 프로필에 명시 시그널이 없어 일반 사용자에게는 부적합
const MULTICULTURAL_COHORT_KEYWORDS: RegExp[] = [
  /결혼이주여성/,
  /다문화\s*가족/,
  /다문화\s*가정/,
  /결혼이민자/,
];

// 보호아동·시설양육 cohort — 사용자 가구에 자녀(single_parent / multi_child) 가
// 있거나 has_children=true 일 때만 통과.
//
// 2026-04-28 사장님 화면 사고 후속:
//   "농촌유학 지원사업" — 자녀 동반 농촌 이주 가족만 대상.
//   사장님(married, has_children NULL) 에게 노출되던 사고 차단.
const CHILD_COHORT_KEYWORDS: RegExp[] = [
  /보호아동/,
  /보호종료아동/,
  /자립준비청년/,
  /청소년\s*치료\s*재활/,
  /청소년치료재활센터/,
  /치료재활센터/,
  /정서[·\s]*행동/,
  /아동복지시설/,
  /가정위탁/,
  /입양\s*가정/,
  /결식아동/,        // 결식 위기 아동 — 자녀 동반 가구만 의미
  /아동급식/,        // 아동 급식지원 — 자녀 동반 가구만 의미
  /방학중\s*급식/,   // 방학중 급식 — 자녀 동반 가구만 의미
  /농촌\s*유학/,     // 농촌유학 — 학령기 자녀 동반 농촌 이주 가족 대상
];

// 보훈·국가유공자 cohort — 사용자 프로필에 보훈 시그널 0 이라 모든 일반 사용자 부적합.
// 2026-04-28 사장님 화면 사고: "교통시설 이용지원(애국지사·국가유공자)" 노출.
// 사장님 자영업자 + 보훈 무관 → 매칭 자체가 부적합.
//
// 추후 user.merit 같은 시그널 도입 시 게이트 통과 조건 완화 가능.
const NATIONAL_MERIT_COHORT_KEYWORDS: RegExp[] = [
  /국가유공자/,
  /보훈\s*대상자/,
  /보훈가족/,
  /애국지사/,
  /참전유공자/,
  /상이군경/,
  /순국선열/,
  /5\.18\s*민주유공자/,
];

// 농어민 cohort — 사용자 occupation 이 "농어민" 일 때만 통과.
// 2026-04-28 사장님 화면 사고: "영암군 농어민 공익수당" 자영업자에게 노출.
// 농민·어민·축산농가 등 명시 키워드는 다른 직업군에 부적합.
const FARMER_COHORT_KEYWORDS: RegExp[] = [
  /농어민/,
  /농민\s*수당/,    // "농민수당" 단독 — 농민 직군 전용
  /어민\s*수당/,
  /농업인\s*수당/,
  /어업인\s*수당/,
  /축산\s*농가/,
  /농가\s*경영/,
  /수산업\s*경영/,
];

// 산후조리·영유아 cohort — has_children=true 사용자만 통과.
// 사장님(married, 자녀 정보 없음) 화면에 산후조리비용 정책이 benefit_tags
// 일치만으로 노출되던 사고 차단. 사용자가 has_children NULL(미입력) 또는
// false 일 때 차단. 마이페이지/온보딩에서 자녀 유무 입력 시 명시 시그널.
const POSTPARTUM_INFANT_COHORT_KEYWORDS: RegExp[] = [
  /산후조리/,
  /산모/,
  /임산부/,
  /임신/,
  /출산\s*가정/,
  /출산\s*축하금/,
  /출산\s*지원금/,
  /영유아/,
  /신생아(?!\s*수)/, // "신생아 수" 같은 통계 용어 회피
  /돌봄\s*도우미/, // 산모·신생아 건강관리지원사업
];

// 기초수급·차상위·저소득 cohort — income_level 이 low/mid_low 가 아니면 부적합.
// 일반 mid/mid_high/high 사용자에게 "기초생활수급자 통합사례관리" 같은 정책이
// region+benefit 점수만으로 통과되던 사고 차단.
//
// 2026-04-28 사장님 화면 사고 후속:
//   "기초생활보장수급자및복지시설생활자위문" 정책이 mid 사용자에게 노출.
//   정규식 /기초생활수급자/ 가 "기초생활보장수급자" 사이의 "보장" 때문에 매칭 안 됨.
//   → /기초생활(\s*보장)?\s*수급자/ 로 보강 (보장 유무·공백 변형 모두 매칭).
const LOW_INCOME_ONLY_COHORT_KEYWORDS: RegExp[] = [
  /기초생활(\s*보장)?\s*수급자/, // 기초생활수급자, 기초생활보장수급자, 기초생활 보장 수급자
  /기초수급자/,
  /의료급여/,
  /의료급여\s*수급권자/,
  /생계급여/,
  /주거급여/,
  /교육급여/,
  /차상위계층(?!\s*및\s*일반)/,  // "차상위계층" 단독 — "차상위계층 및 일반" 류는 통과
  /통합사례관리/,                 // 희망복지지원단 통합사례관리 — 위기가구 대상
  /위기가구/,
  /빈곤가정/,
];

// 장애인 cohort — 사용자 가구에 disabled_family 가 있을 때만 통과
const DISABILITY_COHORT_KEYWORDS: RegExp[] = [
  /장애인/,
  /장애\s*가구/,
  /중증장애/,
  /장애아동/,
  /장애인\s*가구/,
  /장애인\s*가족/,
];

// 정신질환·정신재활 등 민감 질환 전용 정책은 현재 마이페이지에 명시 동의/상태 입력
// 모델이 없다. 의료 관심 태그만으로 추천하면 사용자가 "내 정보와 무관한 민감 정책"으로
// 체감하므로, 별도 프로필 신호가 생기기 전까지 일반 추천/알림에서 기본 차단한다.
const SENSITIVE_MENTAL_HEALTH_COHORT_KEYWORDS: RegExp[] = [
  /정신\s*질환/,
  /정신질환자/,
  /조현병/,
  /정신건강복지센터/,
  /정신\s*재활/,
  /정신재활/,
  /정신\s*치료/,
  /응급\s*입원/,
];

// 출소·보호관찰·법무보호 cohort — 현재 프로필 모델에는 이 민감 cohort를 명시적으로
// 선택하는 입력이 없다. 따라서 일반 추천/알림에서는 기본 차단한다.
const JUSTICE_REENTRY_COHORT_KEYWORDS: RegExp[] = [
  /출소/,
  /출소자/,
  /출소\s*\(?예정\)?자/,
  /보호관찰/,
  /법무보호/,
  /갱생보호/,
  /교정시설/,
  /소년원/,
];

// 정책 본문이 특정 cohort 전용인데 사용자가 그 cohort 에 안 속하면 true 반환.
// true → score 0, signals=[] 로 강제 → filter 에서 minScore 못 넘음.
function isCohortMismatch(haystack: string, user: UserSignals): boolean {
  // 노년층 정책 — 60대 이상 또는 elderly_family 가구만 통과
  if (ELDERLY_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    const isElderlyUser =
      user.ageGroup === '60대 이상' ||
      user.householdTypes.includes('elderly_family');
    if (!isElderlyUser) return true;
  }
  // 결혼이주·다문화 정책 — 현재 프로필 모델에서 매칭 시그널 없음 → 모든 일반 사용자 부적합
  if (MULTICULTURAL_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    return true;
  }
  // 보호아동·시설양육·농촌유학 — 자녀 동반 가구만 통과
  // (single_parent/multi_child household OR has_children=true)
  if (CHILD_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    const isChildUser =
      user.householdTypes.includes('single_parent') ||
      user.householdTypes.includes('multi_child') ||
      user.hasChildren === true;
    if (!isChildUser) return true;
  }
  // 보훈·국가유공자 — 마이그레이션 064 (2026-04-28) 의 merit 시그널 활용.
  // user.merit === 'merit' (본인 또는 유족) 만 통과. NULL/'none' 은 차단.
  // 기존 사용자 모두 NULL 이라 회귀 0 (NATIONAL_MERIT 정책 그대로 차단).
  if (NATIONAL_MERIT_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    if (user.merit !== 'merit') return true;
  }
  // 농어민 — occupation === '농어민' 만 통과 (2026-04-28 OccupationOption 에 추가).
  // 일반 사용자(대학생·직장인·자영업자 등) 에게 농어민 전용 정책 차단.
  if (FARMER_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    if (user.occupation !== '농어민') return true;
  }
  // 장애인 정책 — disabled_family 가구만 통과
  if (DISABILITY_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    if (!user.householdTypes.includes('disabled_family')) return true;
  }
  // 정신질환·정신재활 전용 정책은 별도 명시 프로필 축이 생기기 전까지 일반 추천에서 차단
  if (SENSITIVE_MENTAL_HEALTH_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    return true;
  }
  // 출소·보호관찰·법무보호 정책은 별도 명시 동의/프로필 축이 생기기 전까지 일반 추천에서 차단
  if (JUSTICE_REENTRY_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    return true;
  }
  // 기초수급·차상위·저소득 cohort — low/mid_low 만 통과
  if (LOW_INCOME_ONLY_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    const isLowIncome =
      user.incomeLevel === 'low' || user.incomeLevel === 'mid_low';
    if (!isLowIncome) return true;
  }
  // 산후조리·영유아 cohort — has_children=true 만 통과.
  // NULL(미입력) 사용자는 게이트 미적용 (보수적 — 빈 프로필 추천 보존).
  // false(자녀 없음 명시) 또는 hasChildren 시그널 없는 사용자에게 차단.
  if (POSTPARTUM_INFANT_COHORT_KEYWORDS.some((re) => re.test(haystack))) {
    if (user.hasChildren === false) return true;
    // hasChildren === null 은 미입력 → 게이트 미적용. true 만 통과 의미는 아님.
    // 즉 입력 안 한 사용자에겐 그대로 노출 (입력 유도 UX 가 동시에 동작).
  }
  return false;
}

// 사용자 incomeLevel 이 정책 income_target_level 자격을 충족하는지 확인
// 소득이 낮을수록 더 많은 정책 대상 — 예: low 사용자는 mid 정책도 신청 가능
function matchesIncomeRequirement(
  userLevel: UserSignals['incomeLevel'],
  programLevel: 'low' | 'mid_low' | 'mid' | 'any' | null | undefined,
): boolean {
  if (!userLevel || !programLevel) return false;
  // 'any' 는 모든 소득 수준 허용
  if (programLevel === 'any') return true;
  // 소득 수준 순서: low(0) < mid_low(1) < mid(2) < mid_high(3) < high(4)
  const userOrder: Record<NonNullable<UserSignals['incomeLevel']>, number> = {
    low: 0, mid_low: 1, mid: 2, mid_high: 3, high: 4,
  };
  // 정책 허용 수준 순서: low(0) < mid_low(1) < mid(2)
  const programOrder: Record<'low' | 'mid_low' | 'mid', number> = {
    low: 0, mid_low: 1, mid: 2,
  };
  // 사용자 소득 순서 <= 정책 허용 순서면 자격 충족
  // 예: low(0) <= mid(2) → true, high(4) <= low(0) → false
  return userOrder[userLevel] <= programOrder[programLevel];
}

function hasIncomeTargetMismatch(
  userLevel: UserSignals['incomeLevel'],
  programLevel: 'low' | 'mid_low' | 'mid' | 'any' | null | undefined,
): boolean {
  if (!userLevel || !programLevel) return false;
  return !matchesIncomeRequirement(userLevel, programLevel);
}

// 마감일이 D-7 이내인지 확인 (긴박성 tiebreaker 가산점용)
function isUrgentDeadline(applyEnd: string | null | undefined): boolean {
  if (!applyEnd) return false;
  const ms = new Date(applyEnd).getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  // 0일 이상(아직 마감 안 됨) AND 7일 이하(일주일 내 마감)
  return days >= 0 && days <= 7;
}

// ============================================================
// alert-dispatch / matching pipeline 용 cohort gate 통합 함수
// ============================================================
// scoreProgram 의 점수 계산 부담 없이 cohort 차단 여부만 판단.
// 알림톡·이메일 알림은 사용자가 명시 등록한 규칙 기반이라 점수·minScore
// 무관하지만, cohort mismatch (장애인·결식아동·산후조리·기초수급자)
// 는 명백히 부적합한 발송이라 차단해야 함.
//
// 반환: true=통과 (정책이 사용자에게 적합), false=차단
//
// 게이트 적용 (모두 mismatch 면 false 반환):
//   1) Cohort 키워드 (노년/다문화/아동/장애/저소득/산후조리·영유아)
//   2) household_target_tags 명시 시그널 mismatch
//
// region/age/income/business 매칭은 알림 영역에서는 무관 (사용자가
// 직접 등록한 규칙이라 본인 의지). cohort gate 만 적용.
export function isProgramAllowedForUser<T extends ScorableItem>(
  program: T,
  user: UserSignals,
): boolean {
  // 검색 대상 텍스트: 제목 + 설명 + 출처
  const haystack = `${program.title ?? ''} ${program.description ?? ''} ${program.source ?? ''}`;

  // 1) Cohort 키워드 차단 (노년/다문화/아동/장애/저소득/산후조리)
  if (isCohortMismatch(haystack, user)) return false;

  // DB에 명시된 소득 조건은 사용자가 소득구분을 입력한 경우 자격 gate 로도 적용한다.
  if (hasIncomeTargetMismatch(user.incomeLevel, program.income_target_level)) {
    return false;
  }

  // 2) household_target_tags 명시 mismatch 차단 (regional gate 와 동일 패턴)
  // 정책에 명시 + 사용자에 명시 + 교집합 0 → 차단
  if (
    program.household_target_tags &&
    program.household_target_tags.length > 0 &&
    user.householdTypes.length > 0
  ) {
    const overlap = user.householdTypes.filter(ht =>
      program.household_target_tags!.includes(ht),
    );
    if (overlap.length === 0) return false;
  }

  return true;
}

// 정책 1건에 대해 사용자 프로필 적합도 점수 계산
// 반환값: 원본 아이템 + 합산 점수 + 기여 시그널 목록
export function scoreProgram<T extends ScorableItem>(
  program: T,
  user: UserSignals,
): ScoredItem<T> {
  const signals: MatchSignal[] = [];

  // 검색 대상 텍스트: 제목 + 설명 + 출처 합산
  const haystack = `${program.title ?? ''} ${program.description ?? ''} ${program.source ?? ''}`;

  // ⓪ Cohort 부적합 사전 차단 — 노인 정책에 30대, 결혼이주 정책에 일반인 등
  // 점수 0 + 빈 시그널 반환 → filter 에서 minScore 못 넘게 함.
  // (signals 만 비우면 region 만 매칭된 부적합 정책이 통과 가능 — score=0 으로 명시 차단)
  if (isCohortMismatch(haystack, user)) {
    return { item: program, score: 0, signals: [] };
  }

  // DB에 명시된 소득 조건이 맞지 않으면 관심태그/지역 점수만으로 통과시키지 않는다.
  if (hasIncomeTargetMismatch(user.incomeLevel, program.income_target_level)) {
    return { item: program, score: 0, signals: [] };
  }

  // ① 지역 매칭 — 광역·시군구 정합성을 한 번에 평가.
  // - 전국 정책: +5
  // - 사용자 광역 + 정책 region 에 사용자 district substring 포함: +10
  // - 사용자 광역 + 정책에 시군구 명시 없음: +5 (광역 only 정책)
  // - 같은 광역인데 다른 시군구: 0 (영암군 정책에 순천시 사용자 차단)
  // - 다른 광역: 0
  // program.district 별도 컬럼은 사용 안 함 (welfare_programs 에 컬럼 자체가 없음).
  const regionEval = evaluateRegion(program.region, user.region, user.district);

  // ②-Gate: Regional gate — 사용자가 region 설정 + 정책에 region 정보 있을 때만 적용
  // 정책 region 이 no_match(다른 광역) 또는 district_mismatch(같은 광역 다른 시군구)면
  // benefit_tags·age·occupation 등 다른 시그널 점수 무관하게 score 0 으로 강제 차단.
  //
  // 배경: minScore=8 인데 region 0점이어도 benefit_tags 교집합 (4태그 × 3점 = 12)
  // 만으로 minScore 통과 가능 → 사장님(전남 순천시) 화면에 전북·경남 정책 노출 사고.
  //
  // ⚠️ program.region 존재 체크 필수 — 게이트가 너무 넓으면 회귀:
  //   - blog: region 컬럼 자체 없음 (카테고리 기반) → null → no_match → 게이트로 모두 차단됨
  //   - news: ministry 가 부처명("복지부") 이면 광역 매칭 실패 → no_match → 모두 차단됨
  // 따라서 정책에 region 정보가 있을 때(welfare/loan, 또는 광역인 ministry)만 gate 적용.
  // region NULL 인 정책은 다른 시그널로 평가 (회귀 0).
  //
  // 사용자가 region 미설정인 경우도 게이트 미적용 (빈 프로필 추천 가능해야 함).
  if (
    user.region &&
    program.region &&
    (regionEval.kind === 'no_match' || regionEval.kind === 'district_mismatch')
  ) {
    return { item: program, score: 0, signals: [] };
  }

  if (regionEval.kind === 'national') {
    signals.push({ kind: 'region', score: 5 });
  } else if (regionEval.kind === 'region_district') {
    signals.push({ kind: 'region', score: 5 });
    signals.push({ kind: 'district', score: 5 });
  } else if (regionEval.kind === 'region_only') {
    signals.push({ kind: 'region', score: 5 });
  }
  // district_mismatch / no_match 는 위 gate 에서 차단됨 (사용자 region 설정 시)

  // ③ 혜택 태그 교집합: 일치 1개당 +3점
  if (user.benefitTags.length && program.benefit_tags?.length) {
    const overlap = user.benefitTags.filter(t => program.benefit_tags!.includes(t));
    if (overlap.length > 0) {
      signals.push({
        kind: 'benefit_tags',
        score: 3 * overlap.length,
        detail: overlap.join(', '),
      });
    }
  }

  // ④ 직업 키워드 매칭: +2점
  // profile-options 의 OCCUPATION_KEYWORDS 사용 (중앙 관리)
  if (user.occupation) {
    const keywords = OCCUPATION_KEYWORDS[user.occupation] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'occupation', score: 2 });
    }
  }

  // ⑤ 연령 키워드 매칭: +1점
  // profile-options 의 AGE_KEYWORDS 사용 (중앙 관리)
  if (user.ageGroup) {
    const keywords = AGE_KEYWORDS[user.ageGroup] ?? [];
    if (keywords.some(k => haystack.includes(k))) {
      signals.push({ kind: 'age', score: 1 });
    }
  }

  // ⑥ 소득 — 정확 매칭 우선 (+4), 없으면 본문 키워드 fallback (+2, Phase 1)
  if (program.income_target_level !== undefined && program.income_target_level !== null) {
    // DB 에 정확 매칭 데이터가 있을 때: 자격 충족 여부로 판단
    if (matchesIncomeRequirement(user.incomeLevel, program.income_target_level)) {
      signals.push({
        kind: 'income_target',
        score: 4,
        detail: program.income_target_level,
      });
    }
    // 정확 매칭이 있는데 자격 미달이면 fallback 도 하지 않음 (자격 미달은 자격 미달)
  } else if (user.incomeLevel === 'low' || user.incomeLevel === 'mid_low') {
    // Phase 1 fallback: 정확 매칭 데이터 없을 때만 본문 키워드로 약한 가산
    if (INCOME_KEYWORDS_LOW.some(k => haystack.includes(k))) {
      signals.push({ kind: 'income_keyword', score: 2 });
    }
  }

  // ⑦ 가구상태 — 정확 매칭 우선 (+3 × 일치 수), 없으면 본문 키워드 fallback (+2, Phase 1)
  if (program.household_target_tags && program.household_target_tags.length > 0) {
    // DB 에 정확 매칭 데이터가 있을 때: 교집합으로 판단
    const overlap = user.householdTypes.filter(ht =>
      program.household_target_tags!.includes(ht),
    );
    if (overlap.length > 0) {
      signals.push({
        kind: 'household_target',
        score: 3 * overlap.length,
        detail: overlap.join(', '),
      });
    } else if (user.householdTypes.length > 0) {
      // ⑦-Gate: Household gate — 정책이 disabled_family/single_parent 같은 명시
      // household 시그널을 가졌는데 사용자 가구가 그에 해당 안 하면 강제 차단.
      // 사장님(household_types=[married]) 화면에 disabled_family 정책이 region+benefit
      // 점수만으로 통과되던 사고 — regional gate 와 동일 패턴.
      //
      // 게이트 조건:
      //   1) 정책에 household_target_tags 명시 (NULL 아님 + 빈 배열 아님)
      //   2) 사용자에 householdTypes 명시 (NULL 아님 + 빈 배열 아님)
      //   3) 교집합 0건 — 정책이 요구하는 가구상태에 사용자가 해당 안 함
      //
      // user.householdTypes 가 빈 배열인 경우는 게이트 안 함 (빈 프로필 추천 가능)
      return { item: program, score: 0, signals: [] };
    }
  } else {
    // Phase 1 fallback: 정확 매칭 데이터 없을 때만 본문 키워드로 약한 가산
    for (const ht of user.householdTypes) {
      const keywords = HOUSEHOLD_KEYWORDS[ht] ?? [];
      if (keywords.some(k => haystack.includes(k))) {
        signals.push({ kind: 'household_keyword', score: 2, detail: ht });
      }
    }
  }

  // ⑧ Business 자격 매칭 (자영업자 wedge, Basic 핵심)
  // 사용자가 business_profile 입력했을 때만 평가. 매출/직원/업종/사업자유형/창업N년 자동 매칭.
  // - match     : +5 시그널 추가 (자격 명확 충족)
  // - mismatch  : 강제 score 0 + signals=[] (regional gate 패턴 — 자격 명백 미달은 차단)
  // - unknown   : 영향 없음 (정보 부족 시 다른 시그널로 평가)
  //
  // mismatch 강제 차단 안전성: matchBusinessProfile 이 보수적으로 판정
  // (정책에 명확한 요구사항 + 사용자에 명확한 정보 + 명백한 초과인 경우만 mismatch).
  // false positive 위험 최소화.
  if (user.businessProfile) {
    const businessMatch = evaluateBusinessMatch(haystack, user.businessProfile);
    if (businessMatch === 'mismatch') {
      return { item: program, score: 0, signals: [] };
    }
    if (businessMatch === 'match') {
      signals.push({ kind: 'business_match', score: 5 });
    }
  }

  // ⑨ 마감 임박 tiebreaker: +1점 (다른 매칭이 있을 때만!)
  // 스팸 방지: 아무 매칭 없는 정책이 마감 임박만으로 노출되지 않게
  if (signals.length > 0 && isUrgentDeadline(program.apply_end)) {
    signals.push({ kind: 'urgent_deadline', score: 1 });
  }

  // 모든 시그널 점수 합산
  const score = signals.reduce((sum, s) => sum + s.score, 0);
  return { item: program, score, signals };
}
