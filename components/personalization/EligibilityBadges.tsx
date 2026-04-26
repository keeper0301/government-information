// components/personalization/EligibilityBadges.tsx
// 정책 본문에서 추출한 자격 조건(소득 분위·가구 형태) 을 카드에 노출.
// Phase 1.5 의 income_target_level / household_target_tags 데이터 활용.
//
// 사용자가 자격 정보 입력 안 해도 카드 자체에 "기초생활 우대" / "한부모"
// 등 배지 노출 → 본인 매칭 여부 즉시 판단 가능 (마이페이지 입력 의존도 ↓).
//
// 'any' (전 국민) income 은 시그널 약해 표시 안 함.
// household 다중 tag 은 모두 표시 (보통 1~2개).

import type {
  IncomeTargetLevel,
  HouseholdTargetTag,
} from '@/lib/personalization/targeting-extract';

const INCOME_LABEL: Record<Exclude<IncomeTargetLevel, 'any'>, string> = {
  low: '기초생활',
  mid_low: '차상위',
  mid: '중위소득',
};

const HOUSEHOLD_LABEL: Record<HouseholdTargetTag, string> = {
  single_parent: '한부모',
  multi_child: '다자녀',
  married: '신혼부부',
  disabled_family: '장애 가구',
  elderly_family: '고령 가구',
  single: '1인 가구',
};

type Props = {
  incomeTargetLevel: IncomeTargetLevel | null;
  householdTargetTags: HouseholdTargetTag[] | string[] | null;
};

export function EligibilityBadges({
  incomeTargetLevel,
  householdTargetTags,
}: Props) {
  // 'any' (전 국민) 은 자격 시그널 약해 표시 안 함
  const showIncome =
    incomeTargetLevel !== null && incomeTargetLevel !== 'any';
  const households = (householdTargetTags ?? []).filter(
    (t): t is HouseholdTargetTag => t in HOUSEHOLD_LABEL,
  );

  if (!showIncome && households.length === 0) return null;

  // 자격 배지들 — 호출자가 wrap div 책임 (BusinessMatchBadge 와 같은 라인 통합용).
  // Fragment 반환으로 inline 결합 가능.
  return (
    <>
      {showIncome && (
        // 소득 분위 = amber 톤 (저소득 우대 의미)
        <span className="inline-flex items-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-none">
          {INCOME_LABEL[incomeTargetLevel as Exclude<IncomeTargetLevel, 'any'>]}
        </span>
      )}
      {households.map((tag) => (
        // 가구 형태 = violet 톤 (자격 시각 분리)
        <span
          key={tag}
          className="inline-flex items-center text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 leading-none"
        >
          {HOUSEHOLD_LABEL[tag]}
        </span>
      ))}
    </>
  );
}
