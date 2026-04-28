// ============================================================
// 프로필 옵션 단일 소스 (Single Source of Truth)
// ============================================================
// /mypage/profile-form, /recommend/form, /api/recommend 모두 이걸 import.
// 여기 바꾸면 3곳 동시 반영. 값 불일치 → 매칭 실패 버그 방지.
// ============================================================

export const AGE_OPTIONS = [
  "10대",
  "20대",
  "30대",
  "40대",
  "50대",
  "60대 이상",
] as const;

// 권역별 + 북에서 남 통상 순서 (수도권 → 강원 → 충청 → 호남 → 영남 → 제주).
// lib/regions.ts 의 PROVINCES 와 일관 정렬. "전국" 은 항상 가장 앞.
export const REGION_OPTIONS = [
  "전국",
  // 수도권
  "서울",
  "인천",
  "경기",
  // 강원
  "강원",
  // 충청
  "대전",
  "세종",
  "충북",
  "충남",
  // 호남
  "광주",
  "전북",
  "전남",
  // 영남
  "부산",
  "대구",
  "울산",
  "경북",
  "경남",
  // 제주
  "제주",
] as const;

// 표준 직업 옵션 (이전 "자영업" / "학생" / "무직" 같은 별칭은 전부 여기로 통일)
// 2026-04-28 "농어민" 추가 — 영암군 농어민 공익수당 같은 농어민 전용 정책이
// 일반 사용자에게 노출되던 사고 후속. 농어민 사용자 가입 시 정확 매칭 가능.
export const OCCUPATION_OPTIONS = [
  "대학생",
  "직장인",
  "자영업자",
  "공무원",
  "구직자",
  "주부",
  "농어민",
  "기타",
] as const;

export type AgeOption = (typeof AGE_OPTIONS)[number];
export type RegionOption = (typeof REGION_OPTIONS)[number];
export type OccupationOption = (typeof OCCUPATION_OPTIONS)[number];

// /api/recommend 매칭용 — 직업 → target/description 검색 키워드 매핑
export const OCCUPATION_KEYWORDS: Record<OccupationOption, string[]> = {
  "대학생": ["대학생", "학생", "청년"],
  "직장인": ["근로자", "직장인", "회사원"],
  "자영업자": ["소상공인", "자영업", "사업자"],
  "공무원": ["공무원", "관공서"],
  "구직자": ["구직", "실업", "취업"],
  "주부": ["가정", "양육", "출산"],
  "농어민": ["농어민", "농민", "어민", "농업인", "어업인", "축산농가"],
  "기타": [],
};

// /api/recommend 매칭용 — 나이대 → target/description 검색 키워드
export const AGE_KEYWORDS: Record<AgeOption, string[]> = {
  "10대": ["청소년", "학생"],
  "20대": ["청년", "대학생"],
  "30대": ["청년", "신혼"],
  "40대": ["중장년"],
  "50대": ["중장년", "중년"],
  "60대 이상": ["노인", "어르신", "고령"],
};

// REGION_OPTIONS (짧은 광역명) → 시군구 목록 매핑.
// lib/regions.ts 의 DISTRICTS_BY_PROVINCE 가 정식 광역명("전라남도") 키라
// /recommend 폼이 쓰는 짧은 이름("전남") 으로 변환해서 사용.
// "전국" 은 시군구 없음 (전국 단위 = 시군구 무관).
import {
  DISTRICTS_BY_PROVINCE,
  PROVINCES,
  PROVINCE_SHORT_TO_FULL,
} from "@/lib/regions";

export function getDistrictsForRegion(region: string): string[] {
  if (region === "전국" || !region) return [];
  const fullName = PROVINCE_SHORT_TO_FULL[region];
  if (!fullName) return [];
  const province = PROVINCES.find((p) => p.name === fullName);
  if (!province) return [];
  return DISTRICTS_BY_PROVINCE[province.code] ?? [];
}

// 소득 구간 — 기준중위소득 비율 기반 단순화
// 정확한 수치 입력 회피 (진입장벽), 정책 매칭에 충분한 해상도
export const INCOME_OPTIONS = [
  { value: 'low',      label: '기초생활보장 수준 (기준중위소득 50% 이하)' },
  { value: 'mid_low',  label: '차상위 수준 (50~80%)' },
  { value: 'mid',      label: '중위 (80~120%)' },
  { value: 'mid_high', label: '중위 이상 (120~180%)' },
  { value: 'high',     label: '고소득 (180% 초과)' },
] as const;
export type IncomeOption = typeof INCOME_OPTIONS[number]['value'];

// 가구상태 — 다중 선택 가능 (한부모이자 다자녀 가능)
// value 는 영문(DB 컬럼 일관성), label 은 한글
export const HOUSEHOLD_OPTIONS = [
  { value: 'single',           label: '1인가구' },
  { value: 'married',          label: '신혼부부' },
  { value: 'single_parent',    label: '한부모가정' },
  { value: 'multi_child',      label: '다자녀가정' },
  { value: 'disabled_family',  label: '장애인가구' },
  { value: 'elderly_family',   label: '고령가구·독거노인' },
] as const;
export type HouseholdOption = typeof HOUSEHOLD_OPTIONS[number]['value'];

// 보훈 가족 — 마이그레이션 064 (2026-04-28).
// 국가유공자·보훈대상자·애국지사·참전유공자 등 NATIONAL_MERIT_COHORT 정책의
// 정확 매칭용. 'merit' (본인 또는 유족) 만 cohort 게이트 통과.
// NULL/'none' 사용자에게는 보훈 전용 정책이 추천 섹션에 노출되지 않음.
export const MERIT_OPTIONS = [
  { value: 'merit', label: '보훈 가족 (본인 또는 유족)' },
  { value: 'none',  label: '해당 없음' },
] as const;
export type MeritOption = typeof MERIT_OPTIONS[number]['value'];

// ============================================================
// 자영업자 "내 가게" 프로필 옵션 (business_profiles 테이블 매핑)
// ============================================================
// Phase: 자영업자 자격 진단 wedge (Basic 핵심).
// /mypage/business 입력 폼 + lib/eligibility/business-match.ts 매칭 함수
// + score.ts business 시그널 모두 이 enum 공유.

// 업종 — 정책 자격 키워드 매칭용
// value 는 정책 본문 매칭 시 사용할 한국어 키워드 그룹과 1:1 대응
export const BUSINESS_INDUSTRY_OPTIONS = [
  { value: 'food',          label: '외식·요식업' },
  { value: 'retail',        label: '소매·도소매' },
  { value: 'manufacturing', label: '제조업' },
  { value: 'service',       label: '서비스업' },
  { value: 'it',            label: 'IT·콘텐츠' },
  { value: 'other',         label: '기타' },
] as const;
export type BusinessIndustry = typeof BUSINESS_INDUSTRY_OPTIONS[number]['value'];

// 매출 규모 — 소상공인/중소기업 자격 매칭의 핵심 키
// 정부 정책 기준 (소상공인기본법): 매출 5억 이하·상시근로자 5인 이하 등
export const BUSINESS_REVENUE_OPTIONS = [
  { value: 'under_50m',  label: '5천만원 미만' },
  { value: '50m_500m',   label: '5천만~5억원' },
  { value: '500m_1b',    label: '5억~10억원' },
  { value: '1b_10b',     label: '10억~100억원' },
  { value: 'over_10b',   label: '100억원 이상' },
] as const;
export type BusinessRevenue = typeof BUSINESS_REVENUE_OPTIONS[number]['value'];

// 상시근로자 수 (사장님 본인 제외) — 소상공인 vs 중소기업 분기점
// 소상공인기본법: 광공업·운수업·건설업 10인 미만, 그 외 5인 미만
export const BUSINESS_EMPLOYEE_OPTIONS = [
  { value: 'none',     label: '없음 (1인 사업자)' },
  { value: '1_4',      label: '1~4명' },
  { value: '5_9',      label: '5~9명' },
  { value: '10_49',    label: '10~49명' },
  { value: '50_99',    label: '50~99명' },
  { value: 'over_100', label: '100명 이상' },
] as const;
export type BusinessEmployee = typeof BUSINESS_EMPLOYEE_OPTIONS[number]['value'];

// 사업자 유형 — 일부 정책은 "법인 사업자만" / "개인 사업자만" 자격 차등
export const BUSINESS_TYPE_OPTIONS = [
  { value: 'sole_proprietor', label: '개인 사업자' },
  { value: 'corporation',     label: '법인 사업자' },
] as const;
export type BusinessType = typeof BUSINESS_TYPE_OPTIONS[number]['value'];
