// app/eligibility/[slug]/page.tsx
// 자격(income·household) 카테고리별 정책 모음 페이지 — long-tail SEO 흡수.
// Phase 1.5 의 income_target_level / household_target_tags 데이터를
// 사용자에게 직접 검색 가능한 페이지로 노출.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProgramRow } from '@/components/program-row';
import { welfareToDisplay, loanToDisplay } from '@/lib/programs';
import {
  ELIGIBILITY_SLUGS,
  getEligibilityCategory,
  type EligibilitySlug,
} from '@/lib/eligibility/catalog';

// 6시간 ISR — 정책 추가/마감 빈도 고려. revalidate-on-demand 까지 가지 않아도 충분.
export const revalidate = 21600;

export async function generateStaticParams() {
  return ELIGIBILITY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = getEligibilityCategory(slug);
  if (!category) return { title: '자격 카테고리 없음' };

  const title = `${category.label} 지원 정책 모음 — keepioo`;
  return {
    title,
    description: category.description,
    alternates: { canonical: `https://www.keepioo.com/eligibility/${slug}` },
    openGraph: {
      title,
      description: category.description,
      url: `https://www.keepioo.com/eligibility/${slug}`,
    },
  };
}

const BASE_URL = 'https://www.keepioo.com';
const LIST_LIMIT = 50;

export default async function EligibilityCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getEligibilityCategory(slug);
  if (!category) notFound();

  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  // income type: income_target_level = dbKey
  // household type: household_target_tags @> [dbKey] (PostgREST cs operator)
  // 두 테이블 같은 분기를 inline 적용 — supabase-js 타입이 chain 단계마다 좁혀져
  // helper 로 추출하면 타입 추론 깨짐 (PostgrestFilterBuilder vs QueryBuilder).
  let welfareQ = supabase
    .from('welfare_programs')
    .select('*')
    .or(`apply_end.gte.${today},apply_end.is.null`);
  let loanQ = supabase
    .from('loan_programs')
    .select('*')
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (category.type === 'income') {
    welfareQ = welfareQ.eq('income_target_level', category.dbKey);
    loanQ = loanQ.eq('income_target_level', category.dbKey);
  } else {
    welfareQ = welfareQ.contains('household_target_tags', [category.dbKey]);
    loanQ = loanQ.contains('household_target_tags', [category.dbKey]);
  }

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

  // dday 오름차순 통합 (마감 임박 우선, 상시는 후순)
  const programs = [...welfare, ...loan].sort((a, b) => {
    if (a.dday === null) return 1;
    if (b.dday === null) return -1;
    return a.dday - b.dday;
  });

  // ItemList JSON-LD — 검색엔진이 카테고리 페이지의 항목 묶음 인식
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${category.label} 지원 정책 모음`,
    description: category.description,
    url: `${BASE_URL}/eligibility/${slug}`,
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
        <span className="text-grey-700">{category.label}</span>
      </nav>

      <h1 className="text-[32px] font-extrabold tracking-[-1px] text-grey-900 mb-3 max-md:text-[26px]">
        {category.label} 지원 정책
      </h1>
      <p className="text-[15px] text-grey-700 leading-[1.65] mb-6 max-w-[640px]">
        {category.description}
      </p>

      {/* 자격 키워드 anchor — SEO 본문 풍부화 + 사용자가 어떤 키워드 매칭인지 안내 */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {category.examples.map((kw) => (
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
        <div className="bg-cream rounded-2xl p-10 text-center text-grey-700">
          현재 매칭되는 활성 정책이 없어요. 정책은 매일 새로 등록되니 다시 방문해주세요.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-2">
          {programs.map((program) => (
            <ProgramRow key={`${program.type}-${program.id}`} program={program} />
          ))}
        </div>
      )}

      {/* CTA — 다른 자격 카테고리 둘러보기 */}
      <div className="mt-12 text-center">
        <Link
          href="/eligibility"
          className="inline-flex items-center min-h-[44px] px-6 text-[14px] font-semibold text-grey-700 bg-grey-50 hover:bg-grey-100 rounded-full no-underline transition-colors"
        >
          다른 자격 카테고리 보기 →
        </Link>
      </div>
    </main>
  );
}

// 명시적으로 EligibilitySlug union 타입 export 받음으로 트리쉐이킹 안정
export type { EligibilitySlug };
