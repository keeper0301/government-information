// __tests__/personalization/snapshot-fixtures.ts
// ============================================================
// 추천 score 회귀 방지 snapshot 용 fixture 정책 18개
// ============================================================
// score.ts 의 ScorableItem 형식. 각 fixture 는 의도된 BlockReason 시나리오
// 를 가지고 있어 페르소나 6명을 통과시키면 다양한 분기가 trigger.
//
// 카테고리:
//   - 광역별 (regional_gate): 6
//   - cohort (cohort_mismatch): 6
//   - household_target_tags (household_gate): 3
//   - income_target_level (income_gate): 2
//   - 일반 (강제 차단 신호 없음): 1
//   총 18
// ============================================================

import type { ScorableItem } from "@/lib/personalization/score";

// ─── 광역별 (regional_gate 검증) ─────────────────────────────────────
// 각 정책 region 이 명확한 광역 정식명. 다른 광역 페르소나는 regional_gate 차단.

export const seoulYouthHousing: ScorableItem = {
  id: "fx_seoul_1",
  title: "서울 청년 주거 지원",
  description: "서울 거주 청년 대상 월세 보조",
  region: "서울특별시",
  district: null,
  benefit_tags: ["주거"],
  apply_end: null,
  source: "서울특별시청",
  household_target_tags: null,
  income_target_level: null,
};

export const jeonnamSelfEmployedLoan: ScorableItem = {
  id: "fx_jeonnam_1",
  title: "전남 자영업자 금융 지원",
  description: "전남 거주 자영업자 대상 운영자금 융자",
  region: "전라남도",
  district: null,
  benefit_tags: ["금융", "창업"],
  apply_end: null,
  source: "전라남도청",
  household_target_tags: null,
  income_target_level: null,
};

export const gyeonggiParentingSupport: ScorableItem = {
  id: "fx_gyeonggi_1",
  title: "경기 양육 수당",
  description: "경기 거주 가구 자녀 양육 수당",
  region: "경기도",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "경기도청",
  household_target_tags: null,
  income_target_level: null,
};

// 주의: 본문 "어민" 단독은 FARMER cohort 정규식 (`/어민\s*수당/`) 매칭 안 함.
// 즉 cohort_mismatch 트리거 X. 순수 regional_gate 검증용 (다른 광역 페르소나 차단).
export const busanFarmerSupport: ScorableItem = {
  id: "fx_busan_1",
  title: "부산 어촌 지원사업",
  description: "부산 거주 어민 대상 장비 보조",
  region: "부산광역시",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "부산광역시청",
  household_target_tags: null,
  income_target_level: null,
};

export const chungnamMedicalSupport: ScorableItem = {
  id: "fx_chungnam_1",
  title: "충남 의료비 지원",
  description: "충남 거주 가구 의료비 보조",
  region: "충청남도",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "충청남도청",
  household_target_tags: null,
  income_target_level: null,
};

export const nationalEducationSupport: ScorableItem = {
  id: "fx_national_1",
  title: "전국 학자금 대출",
  description: "전국 대학생 대상 학자금 융자",
  region: "전국",
  district: null,
  benefit_tags: ["교육", "금융"],
  apply_end: null,
  source: "교육부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── cohort 차단 (cohort_mismatch 검증) ──────────────────────────────
// 본문에 cohort 키워드 명시 — 해당 cohort 가 아닌 페르소나는 차단.

export const multiculturalSupport: ScorableItem = {
  id: "fx_cohort_multicultural",
  title: "다문화 가정 정착 지원",
  description: "결혼이민자 가족 한국어 교육 및 생활 적응",
  region: "전국",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: null,
  income_target_level: null,
};

export const youthEmployment: ScorableItem = {
  id: "fx_cohort_youth",
  title: "청년 취업 지원",
  description: "만 19~34세 청년 구직자 직업 훈련 및 취업 알선",
  region: "전국",
  district: null,
  benefit_tags: ["취업"],
  apply_end: null,
  source: "고용노동부",
  household_target_tags: null,
  income_target_level: null,
};

export const elderlyHealthcare: ScorableItem = {
  id: "fx_cohort_elderly",
  title: "노인 의료비 지원",
  description: "만 65세 이상 노인 대상 외래·입원 의료비 본인부담 경감",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: null,
};

export const veteranSupport: ScorableItem = {
  id: "fx_cohort_veteran",
  title: "국가유공자 보훈 지원",
  description: "국가유공자 본인 및 유족 대상 의료비·생활 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료", "생계"],
  apply_end: null,
  source: "보훈처",
  household_target_tags: null,
  income_target_level: null,
};

export const childCareSupport: ScorableItem = {
  id: "fx_cohort_child",
  title: "보호아동 양육수당",
  description: "보호아동 위탁가정 및 시설양육 자녀 대상 양육수당",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: null,
  income_target_level: null,
};

export const farmerSupport: ScorableItem = {
  id: "fx_cohort_farmer",
  title: "농어민 영농자금 지원",
  description: "농어민 대상 영농자금 융자",
  region: "전국",
  district: null,
  benefit_tags: ["창업", "금융"],
  apply_end: null,
  source: "농림축산식품부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── household_target_tags 명시 (household_gate 검증) ────────────────

export const singleParentSupport: ScorableItem = {
  id: "fx_household_singleparent",
  title: "한부모 가정 양육비 지원",
  description: "한부모 가정 양육비 + 학용품비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "여성가족부",
  household_target_tags: ["single_parent"],
  income_target_level: null,
};

export const multiChildSupport: ScorableItem = {
  id: "fx_household_multichild",
  title: "다자녀 가구 양육 수당",
  description: "자녀 3명 이상 다자녀 가구 양육 수당",
  region: "전국",
  district: null,
  benefit_tags: ["양육"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: ["multi_child"],
  income_target_level: null,
};

export const disabledFamilySupport: ScorableItem = {
  id: "fx_household_disabled",
  title: "장애가구 의료비 지원",
  description: "가구원 중 장애인 있는 가구 대상 의료비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: ["disabled_family"],
  income_target_level: null,
};

// ─── income_target_level 명시 (income_gate 검증) ──────────────────────

export const lowIncomeSupport: ScorableItem = {
  id: "fx_income_low",
  title: "저소득 생계급여",
  description: "기초생활보장수급자 본인부담 경감",
  region: "전국",
  district: null,
  benefit_tags: ["생계"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: "low",
};

export const midLowIncomeSupport: ScorableItem = {
  id: "fx_income_midlow",
  title: "차상위 의료급여",
  description: "차상위계층 대상 의료비 지원",
  region: "전국",
  district: null,
  benefit_tags: ["의료"],
  apply_end: null,
  source: "보건복지부",
  household_target_tags: null,
  income_target_level: "mid_low",
};

// ─── 일반 (강제 차단 신호 없음, score 매칭만 평가) ──────────────────

export const generalEntrepreneurSupport: ScorableItem = {
  id: "fx_general_1",
  title: "소상공인 창업 지원",
  description: "신규 창업 소상공인 대상 컨설팅 및 운영자금",
  region: "전국",
  district: null,
  benefit_tags: ["창업", "금융"],
  apply_end: null,
  source: "중소벤처기업부",
  household_target_tags: null,
  income_target_level: null,
};

// ─── 전체 export (snapshot test 가 매트릭스로 사용) ──────────────────

export const ALL_FIXTURES: ScorableItem[] = [
  seoulYouthHousing,
  jeonnamSelfEmployedLoan,
  gyeonggiParentingSupport,
  busanFarmerSupport,
  chungnamMedicalSupport,
  nationalEducationSupport,
  multiculturalSupport,
  youthEmployment,
  elderlyHealthcare,
  veteranSupport,
  childCareSupport,
  farmerSupport,
  singleParentSupport,
  multiChildSupport,
  disabledFamilySupport,
  lowIncomeSupport,
  midLowIncomeSupport,
  generalEntrepreneurSupport,
];
