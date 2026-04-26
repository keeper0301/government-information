// lib/eligibility/catalog.ts
// 자격(income·household) 카테고리별 SEO 페이지의 단일 source of truth.
// /eligibility/[slug] 페이지 + sitemap + 인덱스 페이지가 이 카탈로그를 공유.
//
// slug 는 영문 kebab-case (URL 안정성 우선). 한글 라벨은 별도.

import type {
  IncomeTargetLevel,
  HouseholdTargetTag,
} from '@/lib/personalization/targeting-extract';

export type EligibilitySlug =
  // income
  | 'low-income'
  | 'mid-low-income'
  | 'mid-income'
  // household
  | 'single-parent'
  | 'multi-child'
  | 'married'
  | 'disabled-family'
  | 'elderly-family'
  | 'single';

// 두 그룹: income 은 income_target_level 컬럼과 매칭, household 는 household_target_tags 배열 contains
export type EligibilityCategory = {
  slug: EligibilitySlug;
  type: 'income' | 'household';
  // DB 컬럼 값 (income_target_level OR household_target_tags 원소)
  dbKey: IncomeTargetLevel | HouseholdTargetTag;
  // UI 라벨
  label: string;
  shortLabel: string;
  // SEO 메타용 + 페이지 헤더 본문
  description: string;
  // 자격 키워드 예시 (페이지에 보여줄 anchor)
  examples: string[];
};

export const ELIGIBILITY_CATALOG: Record<EligibilitySlug, EligibilityCategory> = {
  'low-income': {
    slug: 'low-income',
    type: 'income',
    dbKey: 'low',
    label: '기초생활수급자·저소득',
    shortLabel: '기초생활',
    description:
      '기초생활수급자·의료급여 수급권자·긴급복지 대상 등 저소득 가구를 우선 지원하는 정책을 모았어요.',
    examples: ['기초생활수급', '의료급여', '긴급복지', '생계급여', '주거급여'],
  },
  'mid-low-income': {
    slug: 'mid-low-income',
    type: 'income',
    dbKey: 'mid_low',
    label: '차상위·중위소득 60~80%',
    shortLabel: '차상위',
    description:
      '차상위 계층 또는 기준중위소득 60~80% 이하 가구가 지원받을 수 있는 정책을 모았어요.',
    examples: ['차상위', '기준중위소득 60%', '중위소득 70%', '중위소득 80%'],
  },
  'mid-income': {
    slug: 'mid-income',
    type: 'income',
    dbKey: 'mid',
    label: '중위소득 100~150%',
    shortLabel: '중위소득',
    description:
      '기준중위소득 100~150% 이하 가구가 지원받을 수 있는 일반 소득 정책을 모았어요.',
    examples: ['기준중위소득 100%', '중위소득 120%', '중위소득 150%'],
  },
  'single-parent': {
    slug: 'single-parent',
    type: 'household',
    dbKey: 'single_parent',
    label: '한부모 가구',
    shortLabel: '한부모',
    description:
      '한부모 가족·한부모 가정을 위한 양육·생계·주거 지원 정책을 모았어요.',
    examples: ['한부모', '한부모 가족', '한부모 가정'],
  },
  'multi-child': {
    slug: 'multi-child',
    type: 'household',
    dbKey: 'multi_child',
    label: '다자녀 가구',
    shortLabel: '다자녀',
    description:
      '다자녀(3자녀 이상) 가구의 양육·교육·주거 부담을 덜어주는 정책을 모았어요.',
    examples: ['다자녀', '3자녀 이상', '셋째 자녀'],
  },
  married: {
    slug: 'married',
    type: 'household',
    dbKey: 'married',
    label: '신혼부부',
    shortLabel: '신혼부부',
    description:
      '신혼부부 주택자금·전세자금·결혼 지원금 등 결혼 직후 가구를 위한 정책을 모았어요.',
    examples: ['신혼부부', '신혼', '결혼 자금'],
  },
  'disabled-family': {
    slug: 'disabled-family',
    type: 'household',
    dbKey: 'disabled_family',
    label: '장애 가구',
    shortLabel: '장애 가구',
    description:
      '장애인 본인·장애아동·중증장애 가구를 위한 의료·생계·돌봄 지원 정책을 모았어요.',
    examples: ['장애인', '장애아동', '중증장애'],
  },
  'elderly-family': {
    slug: 'elderly-family',
    type: 'household',
    dbKey: 'elderly_family',
    label: '고령·노인 가구',
    shortLabel: '고령 가구',
    description:
      '독거노인·고령가구·만 65세 이상 어르신을 위한 의료·돌봄·소득 지원 정책을 모았어요.',
    examples: ['독거노인', '고령가구', '경로', '만 65세 이상'],
  },
  single: {
    slug: 'single',
    type: 'household',
    dbKey: 'single',
    label: '1인 가구',
    shortLabel: '1인 가구',
    description:
      '1인 가구·독거 청년·중장년 1인 가구를 위한 주거·생활 지원 정책을 모았어요.',
    examples: ['1인 가구', '독거', '단신 가구'],
  },
};

export const ELIGIBILITY_SLUGS = Object.keys(
  ELIGIBILITY_CATALOG,
) as EligibilitySlug[];

export function getEligibilityCategory(
  slug: string,
): EligibilityCategory | null {
  if (!(slug in ELIGIBILITY_CATALOG)) return null;
  return ELIGIBILITY_CATALOG[slug as EligibilitySlug];
}
