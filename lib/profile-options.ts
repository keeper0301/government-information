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

export const REGION_OPTIONS = [
  "전국",
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

// 표준 직업 옵션 (이전 "자영업" / "학생" / "무직" 같은 별칭은 전부 여기로 통일)
export const OCCUPATION_OPTIONS = [
  "대학생",
  "직장인",
  "자영업자",
  "공무원",
  "구직자",
  "주부",
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
