// ============================================================
// /loan/age/[age] — 연령대별 대출·지원금 SEO long-tail 페이지
// ============================================================
// 배경 (Phase 2 A1, 2026-04-29):
//   /loan/region/[code] 와 동일 패턴. "청년 대출", "노인 의료비 대출",
//   "학생 학자금" 같은 광역 키워드를 path-based 고유 URL 로 분리.
//
// 매칭 전략:
//   age_target_min/max 범위 겹침 OR household_target_tags 일부 매칭.
//   PostgREST or() 안에서 and() 그룹으로 두 갈래 합집합.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramRow } from "@/components/program-row";
import { loanToDisplay } from "@/lib/programs";
import {
  AGE_CATALOG,
  AGE_SLUGS,
  getAgeCategory,
  type AgeSlug,
} from "@/lib/age-targeting";
import { LOAN_EXCLUDED_FILTER } from "@/lib/listing-sources";

// 5 age SSG 빌드
export async function generateStaticParams() {
  return AGE_SLUGS.map((slug) => ({ age: slug }));
}

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 3600; // 1시간 ISR

interface PageProps {
  params: Promise<{ age: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { age } = await params;
  const cat = getAgeCategory(age);

  if (!cat) {
    return { title: "연령을 찾을 수 없어요 | 정책알리미" };
  }

  const title = `${cat.label} 대출·지원금 가이드`;
  // welfare 와 description 다소 차별화 — loan 페이지임을 명시
  const description = `${cat.label} 대상 정부 대출과 지원금을 한곳에서 확인하세요. 자격·금리·한도·신청 방법 정리.`;

  return {
    title: `${title} | 정책알리미`,
    description,
    keywords: `${cat.label}, ${cat.shortLabel}, 대출, 정책자금, 신용보증, ${cat.shortLabel} 대출, ${cat.shortLabel} 지원금, 신청 방법`,
    alternates: { canonical: `/loan/age/${cat.slug}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/loan/age/${cat.slug}`,
    },
  };
}

const DISPLAY_LIMIT = 50;

export default async function LoanAgePage({ params }: PageProps) {
  const { age } = await params;
  const cat = getAgeCategory(age);
  if (!cat) notFound();

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // age 매칭 + householdTags 합집합 (welfare 와 동일 전략)
  const conditions: string[] = [];
  if (cat.matchAge) {
    const min = cat.matchAge.min ?? 0;
    const max = cat.matchAge.max ?? 200;
    conditions.push(
      `and(or(age_target_min.lte.${max},age_target_min.is.null),or(age_target_max.gte.${min},age_target_max.is.null))`,
    );
  }
  if (cat.householdTags) {
    conditions.push(`household_target_tags.cs.{${cat.householdTags.join(",")}}`);
  }

  let q = supabase
    .from("loan_programs")
    .select("*", { count: "exact" })
    .not("source_code", "in", LOAN_EXCLUDED_FILTER)
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (conditions.length > 0) {
    q = q.or(conditions.join(","));
  }

  const { data, count } = await q
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(DISPLAY_LIMIT);

  const programs = (data || []).map(loanToDisplay);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${cat.label} 대출·지원금 가이드`,
    description: cat.description,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/loan/age/${cat.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: programs.length,
      itemListElement: programs.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.keepioo.com/loan/${p.id}`,
        name: p.title,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-[1200px] mx-auto px-5">
        {/* 브레드크럼 */}
        <nav className="text-[13px] text-grey-600 mb-4" aria-label="breadcrumb">
          <Link href="/" className="hover:underline">
            홈
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/loan" className="hover:underline">
            소상공인 대출
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-grey-900">{cat.shortLabel}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
            {cat.label} 대출·지원금 가이드
          </h1>
          <p className="mt-2 text-[15px] text-grey-700 leading-[1.6]">
            {cat.label} 대상 정부 대출과 지원금을 한곳에 모았어요. 자격·금리·한도를
            빠르게 확인하세요.
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            현재 활성 {count ?? 0}건 · 마감 임박 순
          </p>
        </header>

        {programs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center">
            <p className="text-grey-700">
              현재 {cat.shortLabel} 대상 활성 대출·지원금이 없습니다.
            </p>
            <Link
              href="/loan"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 대출·지원금 보기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        )}

        {programs.length >= DISPLAY_LIMIT && (
          <div className="mt-6 text-center">
            <Link
              href="/loan"
              className="inline-block px-5 py-3 rounded-full bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700"
            >
              {cat.shortLabel} 대출·지원금 더 보기
            </Link>
          </div>
        )}

        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 연령의 대출·지원금
          </h2>
          <div className="flex flex-wrap gap-2">
            {AGE_SLUGS.filter((s) => s !== cat.slug).map((s: AgeSlug) => (
              <Link
                key={s}
                href={`/loan/age/${s}`}
                className="px-4 py-2 rounded-full bg-white border border-grey-200 text-[14px] text-grey-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {AGE_CATALOG[s].label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
