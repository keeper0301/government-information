// ============================================================
// /welfare/age/[age] — 연령대별 복지 정책 SEO long-tail 페이지
// ============================================================
// 배경 (Phase 2 A1, 2026-04-29):
//   /welfare/region/[code] 와 동일 패턴. "청년 지원금", "노인 복지",
//   "학생 학자금" 같은 광역 키워드를 path-based 고유 URL 로 분리.
//
// 매칭 전략:
//   age_target_min/max 범위 겹침 OR household_target_tags 일부 매칭.
//   PostgREST or() 안에서 and() 그룹으로 두 갈래 합집합.
//
// 차이점 vs 본 /welfare:
//   - 개인화 분리 섹션 없음 → 비로그인 SEO 랜딩에 집중
//   - 검색·페이지네이션 없음 → 카드 그리드 (마감 임박 50건)
//   - force-static + ISR 1시간 (사용자 요청별 fetch 비용 절감)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramRow } from "@/components/program-row";
import { welfareToDisplay } from "@/lib/programs";
import {
  AGE_CATALOG,
  AGE_SLUGS,
  getAgeCategory,
  type AgeSlug,
} from "@/lib/age-targeting";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";

// 5 age SSG 빌드 — youth/middle/senior/parent/student
export async function generateStaticParams() {
  return AGE_SLUGS.map((slug) => ({ age: slug }));
}

export const dynamic = "force-static";
export const dynamicParams = false; // 5 age 외 slug 는 자동 404 (SEO 위 빈 페이지 색인 차단)
export const revalidate = 3600; // 1시간 ISR — age 페이지는 신규 정책 즉시성보다 SEO 안정성 우선

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

  const title = `${cat.label} 복지 정책 가이드`;

  return {
    title: `${title} | 정책알리미`,
    description: cat.description,
    keywords: `${cat.label}, ${cat.shortLabel}, 복지, 지원금, 정책, ${cat.shortLabel} 복지, ${cat.shortLabel} 지원금, 신청 방법`,
    alternates: { canonical: `/welfare/age/${cat.slug}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title,
      description: cat.description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/welfare/age/${cat.slug}`,
    },
  };
}

const DISPLAY_LIMIT = 50;

export default async function WelfareAgePage({ params }: PageProps) {
  const { age } = await params;
  const cat = getAgeCategory(age);
  if (!cat) notFound();

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // age 매칭 + householdTags 매칭 합집합 — PostgREST or() 안에 and() 그룹
  const conditions: string[] = [];
  if (cat.matchAge) {
    // row.age_target_min <= cat.max AND row.age_target_max >= cat.min
    // null 은 모든 연령 매칭으로 해석 (양쪽 다 통과)
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
    .from("welfare_programs")
    .select("*", { count: "exact" })
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .is("duplicate_of_id", null) // 중복 정책 (Phase 3 B3) 사용자 노출 차단
    .or(`apply_end.gte.${today},apply_end.is.null`);

  if (conditions.length > 0) {
    q = q.or(conditions.join(","));
  }

  const { data, count } = await q
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(DISPLAY_LIMIT);

  const programs = (data || []).map(welfareToDisplay);

  // CollectionPage + ItemList JSON-LD — 검색 리치 카드 시그널
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${cat.label} 복지 정책 가이드`,
    description: cat.description,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/welfare/age/${cat.slug}`,
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
        url: `https://www.keepioo.com/welfare/${p.id}`,
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
          <Link href="/welfare" className="hover:underline">
            복지 지원사업
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-grey-900">{cat.shortLabel}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
            {cat.label} 복지 정책 가이드
          </h1>
          <p className="mt-2 text-[15px] text-grey-700 leading-[1.6]">
            {cat.description}
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            현재 활성 {count ?? 0}건 · 마감 임박 순
          </p>
        </header>

        {programs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center">
            <p className="text-grey-700">
              현재 {cat.shortLabel} 대상 활성 복지 정책이 없습니다.
            </p>
            <Link
              href="/welfare"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 복지 정책 보기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        )}

        {/* 본 페이지로 회유 */}
        {programs.length >= DISPLAY_LIMIT && (
          <div className="mt-6 text-center">
            <Link
              href="/welfare"
              className="inline-block px-5 py-3 rounded-full bg-blue-600 text-white text-[14px] font-medium hover:bg-blue-700"
            >
              {cat.shortLabel} 정책 더 보기
            </Link>
          </div>
        )}

        {/* 다른 연령 링크 — 사용자 회유 + 내부 링크 SEO */}
        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 연령의 복지 정책
          </h2>
          <div className="flex flex-wrap gap-2">
            {AGE_SLUGS.filter((s) => s !== cat.slug).map((s: AgeSlug) => (
              <Link
                key={s}
                href={`/welfare/age/${s}`}
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
