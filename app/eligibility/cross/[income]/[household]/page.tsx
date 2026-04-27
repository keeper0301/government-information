// app/eligibility/cross/[income]/[household]/page.tsx
// 자격 복합 매칭 페이지 — income × household 두 조건을 동시에 만족하는 정책만 노출.
// 예) /eligibility/cross/low-income/single-parent → 기초수급 + 한부모 가구
//
// long-tail SEO 흡수 ("저소득 한부모 지원금" / "차상위 다자녀 혜택" 등 high-intent
// 검색어). 단독 income·household 페이지보다 정확한 매칭이라 사용자 만족도 ↑.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProgramRow } from '@/components/program-row';
import { welfareToDisplay, loanToDisplay } from '@/lib/programs';
import {
  CROSS_COMBINATIONS,
  ELIGIBILITY_CATALOG,
  getCrossLabel,
  getCrossDescription,
  getEligibilityCategory,
  type EligibilitySlug,
} from '@/lib/eligibility/catalog';
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from '@/lib/listing-sources';

// 6시간 ISR — 단독 페이지와 동일 정책 (정책 추가/마감 빈도 고려)
export const revalidate = 21600;

const BASE_URL = 'https://www.keepioo.com';
const LIST_LIMIT = 50;

// 18 조합 모두 SSG — 빌드 시점 한 번 + 6h ISR
export async function generateStaticParams() {
  return CROSS_COMBINATIONS.map(({ income, household }) => ({
    income,
    household,
  }));
}

// ────────────────────────────────────────────────────────────────
// 두 segment 화이트리스트 narrow — slug 가 catalog 에 있고 type 도 일치하는지 확인.
// 잘못된 조합 (예: cross/single-parent/low-income, type 뒤바뀜) 은 notFound.
// ────────────────────────────────────────────────────────────────
function resolveCross(income: string, household: string) {
  const incomeCategory = getEligibilityCategory(income);
  const householdCategory = getEligibilityCategory(household);
  if (!incomeCategory || incomeCategory.type !== 'income') return null;
  if (!householdCategory || householdCategory.type !== 'household') return null;
  return { incomeCategory, householdCategory };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ income: string; household: string }>;
}): Promise<Metadata> {
  const { income, household } = await params;
  const resolved = resolveCross(income, household);
  if (!resolved) return { title: '자격 조합 없음' };
  const { incomeCategory, householdCategory } = resolved;

  const label = getCrossLabel(incomeCategory, householdCategory);
  const title = `${label} 지원 정책 모음 — keepioo`;
  const description = getCrossDescription(incomeCategory, householdCategory);
  const url = `${BASE_URL}/eligibility/cross/${income}/${household}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function EligibilityCrossPage({
  params,
}: {
  params: Promise<{ income: string; household: string }>;
}) {
  const { income, household } = await params;
  const resolved = resolveCross(income, household);
  if (!resolved) notFound();
  const { incomeCategory, householdCategory } = resolved;

  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  // 두 조건 AND 결합 — income eq + household contains.
  // [slug]/page.tsx 와 동일 이유로 helper 추출 안 함 (PostgrestFilterBuilder 타입
  // 추론이 chain 단계마다 좁혀져 helper 로 빼면 빌드 에러).
  const welfareQ = supabase
    .from('welfare_programs')
    .select('*')
    .not('source_code', 'in', WELFARE_EXCLUDED_FILTER)
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .eq('income_target_level', incomeCategory.dbKey)
    .contains('household_target_tags', [householdCategory.dbKey]);
  const loanQ = supabase
    .from('loan_programs')
    .select('*')
    .not('source_code', 'in', LOAN_EXCLUDED_FILTER)
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .eq('income_target_level', incomeCategory.dbKey)
    .contains('household_target_tags', [householdCategory.dbKey]);

  const [welfareResult, loanResult] = await Promise.all([
    welfareQ
      .order('apply_end', { ascending: true, nullsFirst: false })
      .limit(LIST_LIMIT),
    loanQ
      .order('apply_end', { ascending: true, nullsFirst: false })
      .limit(LIST_LIMIT),
  ]);

  const welfare = (welfareResult.data ?? []).map(welfareToDisplay);
  const loan = (loanResult.data ?? []).map(loanToDisplay);
  const programs = [...welfare, ...loan].sort((a, b) => {
    if (a.dday === null) return 1;
    if (b.dday === null) return -1;
    return a.dday - b.dday;
  });

  const label = getCrossLabel(incomeCategory, householdCategory);
  const description = getCrossDescription(incomeCategory, householdCategory);

  // ItemList JSON-LD — 검색엔진이 카테고리 페이지의 묶음 인식
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${label} 지원 정책 모음`,
    description,
    url: `${BASE_URL}/eligibility/cross/${income}/${household}`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'keepioo · 정책알리미',
      url: BASE_URL,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: programs.length,
      itemListElement: programs.slice(0, 20).map((p, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: p.title,
        url: `${BASE_URL}/${p.type}/${p.id}`,
      })),
    },
  };

  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:pt-24 max-md:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* breadcrumb */}
      <nav className="mb-4 text-[13px] text-grey-600">
        <Link href="/" className="hover:text-grey-900 no-underline">
          홈
        </Link>
        {' › '}
        <Link href="/eligibility" className="hover:text-grey-900 no-underline">
          자격별 정책
        </Link>
        {' › '}
        <span className="text-grey-700">{label}</span>
      </nav>

      <h1 className="text-[32px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[26px]">
        {label} 지원 정책
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-6 max-w-[640px]">
        {description}
      </p>

      {/* 자격 키워드 — income · household 양쪽 examples 합쳐 노출 */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {[...incomeCategory.examples, ...householdCategory.examples].map((kw) => (
          <span
            key={kw}
            className="text-[12px] font-medium text-grey-700 bg-grey-50 border border-grey-200 rounded-full px-3 py-1"
          >
            #{kw}
          </span>
        ))}
      </div>

      <div className="text-[13px] text-grey-600 mb-3">
        매칭 정책 <strong className="text-grey-900">{programs.length.toLocaleString()}</strong>건
        {' '}(매일 자동 업데이트 · 마감 임박 순)
      </div>

      {programs.length === 0 ? (
        <EmptyState income={incomeCategory.slug} household={householdCategory.slug} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-2">
          {programs.map((program) => (
            <ProgramRow key={`${program.type}-${program.id}`} program={program} />
          ))}
        </div>
      )}

      {/* CTA — 단독 카테고리 둘러보기 */}
      <div className="mt-12 flex items-center justify-center gap-3 max-md:flex-col">
        <Link
          href={`/eligibility/${incomeCategory.slug}`}
          className="inline-flex items-center min-h-[44px] px-5 text-[14px] font-semibold text-grey-700 bg-grey-50 hover:bg-grey-100 rounded-full no-underline transition-colors"
        >
          {incomeCategory.label} 전체 보기 →
        </Link>
        <Link
          href={`/eligibility/${householdCategory.slug}`}
          className="inline-flex items-center min-h-[44px] px-5 text-[14px] font-semibold text-grey-700 bg-grey-50 hover:bg-grey-100 rounded-full no-underline transition-colors"
        >
          {householdCategory.label} 전체 보기 →
        </Link>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────
// 빈 결과 안내 — 두 조건 동시 만족 정책이 없을 때 단독 카테고리로 유도.
// 0건 페이지가 막다른 길 되지 않게 함.
// ────────────────────────────────────────────────────────────────
function EmptyState({
  income,
  household,
}: {
  income: EligibilitySlug;
  household: EligibilitySlug;
}) {
  return (
    <div className="bg-cream rounded-2xl p-8 text-center">
      <p className="text-[15px] text-grey-800 mb-2 leading-[1.6]">
        두 조건을 동시에 만족하는 활성 정책이 현재 없어요.
      </p>
      <p className="text-[14px] text-grey-700 mb-5 leading-[1.6]">
        한쪽 조건만으로 검색하시면 더 많은 정책을 보실 수 있어요.
      </p>
      <div className="flex items-center justify-center gap-3 max-md:flex-col">
        <Link
          href={`/eligibility/${income}`}
          className="inline-flex items-center min-h-[40px] px-4 text-[13px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full no-underline"
        >
          {ELIGIBILITY_CATALOG[income].label} 정책 보기 →
        </Link>
        <Link
          href={`/eligibility/${household}`}
          className="inline-flex items-center min-h-[40px] px-4 text-[13px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full no-underline"
        >
          {ELIGIBILITY_CATALOG[household].label} 정책 보기 →
        </Link>
      </div>
    </div>
  );
}
