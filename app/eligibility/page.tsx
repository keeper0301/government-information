// app/eligibility/page.tsx
// 자격 카테고리 인덱스 페이지 — 8개 단독 슬러그 카드 그리드 +
// "자주 찾는 조합" 섹션 (income × household 복합 매칭, 매칭 ≥ 5건만).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  CROSS_COMBINATIONS,
  ELIGIBILITY_CATALOG,
  ELIGIBILITY_SLUGS,
  HOUSEHOLD_SLUGS,
  INCOME_SLUGS,
  getCrossLabel,
  type EligibilitySlug,
} from '@/lib/eligibility/catalog';

export const revalidate = 21600; // 6h ISR — 정책 추가/마감 추적 + 추천 조합 갱신

export const metadata: Metadata = {
  title: '자격별 정책 모음 — keepioo',
  description:
    '소득 분위·가구 형태별로 본인이 받을 수 있는 정부 지원 정책을 모았어요. 기초생활·차상위·한부모·다자녀·신혼부부·장애·고령·1인 가구.',
  alternates: { canonical: 'https://www.keepioo.com/eligibility' },
};

// 자주 찾는 조합 노출 기준 — 너무 적은 매칭은 사용자 만족도 낮음
const RECOMMEND_MIN_COUNT = 5;
const RECOMMEND_MAX = 8;

// 추천 조합 1건 형 정의 — 인덱스 → CrossSection 까지 같은 객체 흐름
type RecommendedCombo = {
  income: EligibilitySlug;
  household: EligibilitySlug;
  incomeLabel: string;
  householdLabel: string;
  combinedLabel: string;
  count: number;
};

export default async function EligibilityIndexPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  // 활성 정책에서 income/household 페어 분포 — welfare + loan 한 번씩만 가져와
  // JS Map 으로 집계. 18 조합 × 2 table = 36 카운트 쿼리보다 가벼움.
  const [welfareRes, loanRes] = await Promise.all([
    supabase
      .from('welfare_programs')
      .select('income_target_level, household_target_tags')
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .not('income_target_level', 'is', null),
    supabase
      .from('loan_programs')
      .select('income_target_level, household_target_tags')
      .or(`apply_end.gte.${today},apply_end.is.null`)
      .not('income_target_level', 'is', null),
  ]);

  // key = `${income_dbKey}::${household_dbKey}` → count
  const countMap = new Map<string, number>();
  const allRows = [...(welfareRes.data ?? []), ...(loanRes.data ?? [])];
  for (const row of allRows) {
    const income = row.income_target_level as string | null;
    const tags = (row.household_target_tags ?? []) as string[];
    if (!income) continue;
    for (const tag of tags) {
      const key = `${income}::${tag}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
  }

  // 18 조합 → 매칭 카운트 부착 → 임계값 통과 + 상위 N
  const recommendedCombos: RecommendedCombo[] = CROSS_COMBINATIONS.map(
    ({ income, household }) => {
      const incomeCat = ELIGIBILITY_CATALOG[income];
      const householdCat = ELIGIBILITY_CATALOG[household];
      const key = `${incomeCat.dbKey}::${householdCat.dbKey}`;
      return {
        income,
        household,
        incomeLabel: incomeCat.label,
        householdLabel: householdCat.label,
        combinedLabel: getCrossLabel(incomeCat, householdCat),
        count: countMap.get(key) ?? 0,
      };
    },
  )
    .filter((c) => c.count >= RECOMMEND_MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, RECOMMEND_MAX);

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:pt-24 max-md:px-6">
      <h1 className="text-[32px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[26px]">
        자격별 정책 모음
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-10 max-w-[640px]">
        소득 분위·가구 형태별로 본인이 받을 수 있는 정부 지원 정책을 모았어요.
        본문 자동 분석으로 매일 업데이트.
      </p>

      <Section title="소득 분위별" slugs={INCOME_SLUGS} />
      <Section title="가구 형태별" slugs={HOUSEHOLD_SLUGS} />

      {recommendedCombos.length > 0 && (
        <CrossSection combos={recommendedCombos} />
      )}
    </main>
  );
}

function Section({ title, slugs }: { title: string; slugs: typeof ELIGIBILITY_SLUGS }) {
  return (
    <section className="mb-12 last:mb-0">
      <h2 className="text-[18px] font-bold text-grey-900 mb-4 tracking-[-0.3px]">
        {title}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-md:grid-cols-1">
        {slugs.map((slug) => {
          const c = ELIGIBILITY_CATALOG[slug];
          return (
            <Link
              key={slug}
              href={`/eligibility/${slug}`}
              className="block bg-white rounded-2xl shadow-sm p-5 no-underline hover:shadow-md transition-shadow"
            >
              <div className="text-[16px] font-bold text-grey-900 mb-1.5 tracking-[-0.3px]">
                {c.label}
              </div>
              <p className="text-[13px] text-grey-600 leading-[1.55] line-clamp-2">
                {c.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// 자주 찾는 복합 조합 — income × household 두 조건 모두 만족 정책 모음 link
function CrossSection({ combos }: { combos: RecommendedCombo[] }) {
  return (
    <section className="mb-12 last:mb-0">
      <h2 className="text-[18px] font-bold text-grey-900 mb-1 tracking-[-0.3px]">
        자주 찾는 조합
      </h2>
      <p className="text-[13px] text-grey-600 mb-4">
        소득과 가구 조건을 동시에 만족하는 정책을 모았어요.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-md:grid-cols-1">
        {combos.map((c) => (
          <Link
            key={`${c.income}-${c.household}`}
            href={`/eligibility/cross/${c.income}/${c.household}`}
            className="block bg-white rounded-2xl shadow-sm p-5 no-underline hover:shadow-md transition-shadow"
          >
            <div className="text-[16px] font-bold text-grey-900 mb-1.5 tracking-[-0.3px]">
              {c.combinedLabel}
            </div>
            <p className="text-[13px] text-grey-700 leading-[1.55]">
              매칭 정책{' '}
              <strong className="font-semibold text-grey-900">
                {c.count.toLocaleString()}
              </strong>
              건
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
