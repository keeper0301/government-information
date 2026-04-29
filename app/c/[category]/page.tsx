// ============================================================
// /c/[category] — 카테고리 hub (청년·노년·자영업·주거)
// ============================================================
// 배경 (Phase 2 A2, 2026-04-29):
//   사용자 그룹 wedge 4종 (youth/senior/business/housing) 의 종합 랜딩.
//   "청년 정책", "노인 복지", "소상공인 지원" 같은 광역 검색 키워드를
//   path-based 단일 URL 로 흡수해 SEO 트래픽을 모은다.
//
// 매칭 전략:
//   benefit_tags / age_tags / occupation_tags 세 축 중 하나라도 겹치면 매칭
//   (PostgREST `.ov` overlaps). 광범위 노출 — hub 의 의도와 일치.
//
// 본 페이지와의 차이:
//   - 검색·페이지네이션 없음 → 5건 추천 + 5건 마감 임박 + 가이드 + 블로그
//   - 비로그인 SEO 랜딩 우선, 개인화 분리 섹션 없음
//   - force-static + ISR 1시간 (사용자 요청별 fetch 비용 절감)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";
import { getGuides } from "@/lib/policy-guides";
import {
  buildHubOrClause,
  CATEGORY_HUBS,
  CATEGORY_SLUGS,
  getCategoryHub,
  type CategoryHub,
} from "@/lib/category-hubs";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";

// 4 카테고리 SSG 빌드 — 다른 slug 는 자동 404
export async function generateStaticParams() {
  return CATEGORY_SLUGS.map((slug) => ({ category: slug }));
}

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 3600; // 1시간 ISR

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const hub = getCategoryHub(category);

  if (!hub) {
    return { title: "카테고리를 찾을 수 없어요 | 정책알리미" };
  }

  return {
    title: `${hub.label} | 정책알리미`,
    description: hub.description,
    keywords: `${hub.label}, ${hub.shortLabel}, 정부 지원, 지원금, 정책, ${hub.shortLabel} 지원`,
    alternates: { canonical: `/c/${hub.slug}` },
    authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
    openGraph: {
      title: hub.label,
      description: hub.description,
      type: "website",
      siteName: "정책알리미",
      locale: "ko_KR",
      url: `/c/${hub.slug}`,
    },
  };
}

const RECOMMEND_LIMIT = 5;
const DEADLINE_LIMIT = 5;
const GUIDE_LIMIT = 3;
const BLOG_LIMIT = 3;

// ============================================================
// PostgREST or-clause 작성 헬퍼
export default async function CategoryHubPage({ params }: PageProps) {
  const { category } = await params;
  const hub = getCategoryHub(category);
  if (!hub) notFound();

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const orClause = buildHubOrClause(hub);

  // ============================================================
  // 4 fetch 병렬 실행 — welfare/loan 추천 + 마감 임박 + 가이드 + 블로그
  // ============================================================
  // welfare/loan 각각:
  //   - 활성 정책 (apply_end >= today OR null)
  //   - source_code 제외 필터 (stale 데이터 차단)
  //   - or-clause 매칭 (benefit/age/occupation 세 축 합집합)
  //   - apply_end 오름차순 → 20건 fetch (한 번에 가져와 마감 임박 5 + 추천 5
  //     클라이언트 분배. 20 = 충분한 분배 풀 — 5건 분리 후에도 여유 보장)
  //
  // PostgREST 에서 .or() 안에 빈 인자 넣으면 신택스 에러 → orClause null 가드.
  //
  // 한 query 에 .or() 두 번 호출 — supabase-js 가 두 .or() 를 자동으로 AND 결합.
  // 의도: (apply_end 활성) AND (세 축 매칭). 별도 .filter() 분리보다 간결.
  // ============================================================
  const [welfareRes, loanRes, guidesAll, blogRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from("welfare_programs")
        .select("*")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .is("duplicate_of_id", null) // 중복 정책 (Phase 3 B3) 사용자 노출 차단
        .or(`apply_end.gte.${today},apply_end.is.null`);
      if (orClause) q = q.or(orClause);
      return q.order("apply_end", { ascending: true, nullsFirst: false }).limit(20);
    })(),
    (async () => {
      let q = supabase
        .from("loan_programs")
        .select("*")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .is("duplicate_of_id", null) // 중복 정책 (Phase 3 B3) 사용자 노출 차단
        .or(`apply_end.gte.${today},apply_end.is.null`);
      if (orClause) q = q.or(orClause);
      return q.order("apply_end", { ascending: true, nullsFirst: false }).limit(20);
    })(),
    // 가이드는 hub 라벨이 일부 일치하는 5건 정도 후보 가져온 뒤 클라이언트에서
    // 첫 N개 사용. policy_guides 자체에 카테고리 컬럼 없어 단순 latest 채택.
    getGuides(GUIDE_LIMIT),
    // 블로그 — blog_posts.category = blogCategory 정확 매칭, 발행된 글만.
    hub.blogCategory
      ? supabase
          .from("blog_posts")
          .select("slug, title, category, published_at")
          .eq("category", hub.blogCategory)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false })
          .limit(BLOG_LIMIT)
      : Promise.resolve({ data: [] }),
  ]);

  const welfareRows = (welfareRes.data ?? []) as WelfareProgram[];
  const loanRows = (loanRes.data ?? []) as LoanProgram[];

  // ============================================================
  // 정책 분배 — 추천 5건 + 마감 임박 5건
  // ============================================================
  // welfare/loan 통합 후:
  //   - 마감 임박: apply_end != null 인 것만 dday 오름차순 5건
  //   - 추천: 마감 임박에 안 들어간 나머지 (상시·먼 미래) 중 5건
  //   상시 정책이 추천에서 보이게 하면서 마감 임박은 별도로 부각.
  // ============================================================
  const allPrograms = [
    ...welfareRows.map(welfareToDisplay),
    ...loanRows.map(loanToDisplay),
  ];

  // 마감 임박 — dday 가 0 이상인 것만, 오름차순
  const deadlineSoon = allPrograms
    .filter((p) => p.dday !== null && p.dday >= 0)
    .sort((a, b) => (a.dday ?? Infinity) - (b.dday ?? Infinity))
    .slice(0, DEADLINE_LIMIT);

  // 추천 — 마감 임박에 안 들어간 것 + 임박 후순위 (긴 마감 또는 상시).
  // 임박 5건과 중복 제거 후 5건.
  const deadlineSoonIds = new Set(deadlineSoon.map((p) => p.id));
  const recommended = allPrograms
    .filter((p) => !deadlineSoonIds.has(p.id))
    .slice(0, RECOMMEND_LIMIT);

  const guides = guidesAll.slice(0, GUIDE_LIMIT);
  const blogPosts = (blogRes.data ?? []) as Array<{
    slug: string;
    title: string;
    category: string | null;
    published_at: string | null;
  }>;

  // ============================================================
  // CollectionPage JSON-LD — 검색 리치 카드 시그널
  // ============================================================
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: hub.label,
    description: hub.description,
    inLanguage: "ko-KR",
    url: `https://www.keepioo.com/c/${hub.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "정책알리미",
      url: "https://www.keepioo.com",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: recommended.length + deadlineSoon.length,
      itemListElement: [...recommended, ...deadlineSoon].map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.keepioo.com/${p.type}/${p.id}`,
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
          <span className="text-grey-900">{hub.shortLabel}</span>
        </nav>

        {/* Hero — emoji + label + hero 한 줄 + 통계 */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <span className="text-[36px] leading-none" aria-hidden="true">
              {hub.emoji}
            </span>
            <h1 className="text-[32px] font-bold tracking-[-0.5px] text-grey-900 max-md:text-[24px]">
              {hub.label}
            </h1>
          </div>
          <p className="mt-3 text-[15px] text-grey-700 leading-[1.6]">
            {hub.hero}
          </p>
          <p className="mt-3 text-[13px] text-grey-600">
            현재 {hub.shortLabel} 매칭 정책 {allPrograms.length}건 (복지 {welfareRows.length} · 대출 {loanRows.length})
          </p>
        </header>

        {/* 추천 정책 5건 */}
        {recommended.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              추천 정책
            </h2>
            <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
              {recommended.map((p) => (
                <ProgramRow key={p.id} program={p} />
              ))}
            </div>
          </section>
        )}

        {/* 마감 임박 5건 */}
        {deadlineSoon.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              마감 임박
            </h2>
            <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
              {deadlineSoon.map((p) => (
                <ProgramRow key={p.id} program={p} />
              ))}
            </div>
          </section>
        )}

        {/* 비매칭 안내 — 추천·임박 모두 0 일 때 */}
        {recommended.length === 0 && deadlineSoon.length === 0 && (
          <div className="rounded-2xl bg-white border border-grey-200 p-8 text-center mb-10">
            <p className="text-grey-700">
              현재 {hub.shortLabel} 카테고리에 매칭되는 활성 정책이 없습니다.
            </p>
            <Link
              href="/welfare"
              className="mt-4 inline-block text-blue-600 hover:underline text-[14px]"
            >
              전체 복지 정책 보기 →
            </Link>
          </div>
        )}

        {/* [E2 광고] AdSense in-feed — 마감 임박 정책 (사용자 핵심 가치) 다음,
            관련 가이드/블로그 (보조 콘텐츠) 사이. 자연 흐름 끊지 않는 위치. */}
        {(recommended.length > 0 || deadlineSoon.length > 0) && (
          <div className="mb-10">
            <AdSlot />
          </div>
        )}

        {/* 관련 가이드 — policy_guides 최신 N건 (정책 바이블 자산) */}
        {guides.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              관련 정책 가이드
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  href={`/guides/${g.slug}`}
                  className="block bg-white border border-grey-200 rounded-2xl p-5 hover:border-blue-400 transition-colors no-underline"
                >
                  <div className="text-[12px] text-grey-500 mb-1">정책 가이드</div>
                  <div className="text-[15px] font-semibold text-grey-900 leading-[1.4]">
                    {g.title}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 관련 블로그 — blog_posts.category = hub.blogCategory */}
        {blogPosts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              {hub.shortLabel} 관련 블로그
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {blogPosts.map((b) => (
                <Link
                  key={b.slug}
                  href={`/blog/${b.slug}`}
                  className="block bg-white border border-grey-200 rounded-2xl p-5 hover:border-blue-400 transition-colors no-underline"
                >
                  <div className="text-[12px] text-grey-500 mb-1">
                    {b.category ?? "블로그"}
                  </div>
                  <div className="text-[15px] font-semibold text-grey-900 leading-[1.4]">
                    {b.title}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 다른 카테고리 hub 회유 — 내부 링크 SEO + 사용자 회유 */}
        <section className="mt-12 pt-8 border-t border-grey-200">
          <h2 className="text-[18px] font-bold text-grey-900 mb-4">
            다른 카테고리
          </h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_SLUGS.filter((s) => s !== hub.slug).map((s) => (
              <Link
                key={s}
                href={`/c/${s}`}
                className="px-4 py-2 rounded-full bg-white border border-grey-200 text-[14px] text-grey-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <span className="mr-1.5" aria-hidden="true">
                  {CATEGORY_HUBS[s].emoji}
                </span>
                {CATEGORY_HUBS[s].label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
