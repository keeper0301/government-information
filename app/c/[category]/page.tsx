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
import { hasSupabaseAnonEnv } from "@/lib/supabase/env";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { CohortCtaBanner } from "@/components/cohort-cta-banner";
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
const INSIGHT_LIMIT = 3;  // 카테고리별 keepioo 인사이트 노출 수 (AdSense 큐레이션 시그널)
const INSIGHT_SNIPPET_LEN = 130; // unique_insight 발췌 길이 (1~2줄)

// ============================================================
// PostgREST or-clause 작성 헬퍼
export default async function CategoryHubPage({ params }: PageProps) {
  const { category } = await params;
  const hub = getCategoryHub(category);
  if (!hub) notFound();

  const today = new Date().toISOString().split("T")[0];
  const orClause = buildHubOrClause(hub);
  const emptyResult = { data: [] };

  // ============================================================
  // 4 fetch 병렬 실행 — welfare/loan 추천 + 마감 임박 + 가이드 + 블로그
  // ============================================================
  // Supabase env 가 없는 로컬/CI 정적 build 에서는 DB 의존 섹션을 빈 상태로 렌더한다.
  // 실제 Vercel/운영 env 에서는 기존 query 경로 그대로 실행된다.
  const [welfareRes, loanRes, guidesAll, blogRes, insightWelfareRes, insightLoanRes] =
    hasSupabaseAnonEnv()
      ? await (async () => {
          const supabase = await createClient();
          return Promise.all([
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
            getGuides(GUIDE_LIMIT),
            hub.blogCategory
              ? supabase
                  .from("blog_posts")
                  .select("slug, title, category, published_at")
                  .eq("category", hub.blogCategory)
                  .not("published_at", "is", null)
                  .order("published_at", { ascending: false })
                  .limit(BLOG_LIMIT)
              : Promise.resolve(emptyResult),
            (async () => {
              let q = supabase
                .from("welfare_programs")
                .select("id, title, unique_insight, view_count")
                .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
                .is("duplicate_of_id", null)
                .not("unique_insight", "is", null);
              if (orClause) q = q.or(orClause);
              return q.order("view_count", { ascending: false, nullsFirst: false }).limit(INSIGHT_LIMIT);
            })(),
            (async () => {
              let q = supabase
                .from("loan_programs")
                .select("id, title, unique_insight, view_count")
                .not("source_code", "in", LOAN_EXCLUDED_FILTER)
                .is("duplicate_of_id", null)
                .not("unique_insight", "is", null);
              if (orClause) q = q.or(orClause);
              return q.order("view_count", { ascending: false, nullsFirst: false }).limit(INSIGHT_LIMIT);
            })(),
          ]);
        })()
      : await Promise.all([
          Promise.resolve(emptyResult),
          Promise.resolve(emptyResult),
          getGuides(GUIDE_LIMIT),
          Promise.resolve(emptyResult),
          Promise.resolve(emptyResult),
          Promise.resolve(emptyResult),
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
  // 인사이트 발췌 — welfare + loan unique_insight 통합 view_count 인기순 3건
  // ============================================================
  // 백필 진행 (cron 4회/일 일 400건) 따라 자연스럽게 채워짐. 0건이면 섹션 안 보임.
  // 발췌 ~130자 (마침표/줄바꿈 자연 잘림) — 한눈에 큐레이션 시그널.
  type InsightProgram = {
    type: "welfare" | "loan";
    id: string;
    title: string;
    unique_insight: string;
    view_count: number | null;
  };
  const insightWelfareRows = (insightWelfareRes.data ?? []) as Array<{
    id: string;
    title: string;
    unique_insight: string | null;
    view_count: number | null;
  }>;
  const insightLoanRows = (insightLoanRes.data ?? []) as Array<{
    id: string;
    title: string;
    unique_insight: string | null;
    view_count: number | null;
  }>;
  const insightPrograms: InsightProgram[] = [
    ...insightWelfareRows.map((r) => ({ type: "welfare" as const, ...r, unique_insight: r.unique_insight ?? "" })),
    ...insightLoanRows.map((r) => ({ type: "loan" as const, ...r, unique_insight: r.unique_insight ?? "" })),
  ]
    .filter((r) => r.unique_insight.trim().length >= 80)
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, INSIGHT_LIMIT);

  // 발췌 만들기 — 마침표/줄바꿈 우선 잘림, 그래도 길면 ... 추가
  function snippetOf(text: string, maxLen: number): string {
    const flat = text.trim().replace(/\s+/g, " ");
    if (flat.length <= maxLen) return flat;
    const slice = flat.slice(0, maxLen);
    const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("。"), slice.lastIndexOf("?"));
    return (lastBreak > maxLen * 0.5 ? slice.slice(0, lastBreak + 1) : slice) + "…";
  }

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

  // ============================================================
  // FAQPage JSON-LD — Google 검색 rich card + AdSense 콘텐츠 깊이 신호
  // hub.faq 가 있을 때만 (4 cohort 모두 채워져 있음)
  // ============================================================
  const faqJsonLd = hub.faq && hub.faq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: hub.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

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
            현재 {hub.shortLabel} 매칭 정책 {allPrograms.length}건 (복지 {welfareRows.length} · 대출 {loanRows.length}) · 매일 갱신
          </p>
        </header>

        {/* 가입 CTA — Hero 직후 강한 배너 (광고 도달 트래픽 conversion).
            Phase 2026-05-06: cohort hub 에 명시 가입 유도 부재로 광고 ROI 낮던 사고 fix. */}
        <CohortCtaBanner
          shortLabel={hub.shortLabel}
          emoji={hub.emoji}
          variant="primary"
        />

        {/* 운영자 큐레이션 노트 — AdSense "재게시 X, 운영자 직접 큐레이션" 시그널.
            welfare 상세 unique_insight 박스와 같은 디자인 (파란 카드 + 배지) — 일관성. */}
        {hub.curatorNote && (
          <section className="bg-blue-50/40 border border-blue-200 rounded-2xl p-7 mb-8 max-md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.3px]">
                운영자 시각 — 이 카테고리에서 챙길 점
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                keepioo 큐레이션
              </span>
            </div>
            <p className="text-[15px] text-grey-800 leading-[1.8]">
              {hub.curatorNote}
            </p>
          </section>
        )}

        {/* 인사이트 정책 발췌 — unique_insight 보유 정책 view_count 인기순 N건.
            AdSense 검수자 sample 시 "큐레이션 X 재게시" 시그널 강화. 0건이면 섹션 자체 안 보임. */}
        {insightPrograms.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[20px] font-bold text-grey-900">
                이 카테고리 인사이트 정책
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                keepioo 정리
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {insightPrograms.map((p) => (
                <Link
                  key={`${p.type}-${p.id}`}
                  href={`/${p.type}/${p.id}`}
                  className="block bg-white border border-grey-200 rounded-2xl p-5 hover:border-blue-400 transition-colors no-underline"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[12px] text-grey-500">
                      {p.type === "welfare" ? "복지" : "대출"}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      keepioo 정리
                    </span>
                  </div>
                  <div className="text-[15px] font-semibold text-grey-900 leading-[1.4] mb-2">
                    {p.title}
                  </div>
                  <div className="text-[13px] text-grey-700 leading-[1.6]">
                    {snippetOf(p.unique_insight, INSIGHT_SNIPPET_LEN)}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

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

        {/* mid-page 가입 CTA — 마감 임박 직후 가장 자연스러운 conversion 지점.
            "이 정책 놓치지 마세요" 메시지로 가입 유도. */}
        {deadlineSoon.length > 0 && (
          <CohortCtaBanner
            shortLabel={hub.shortLabel}
            emoji={hub.emoji}
            variant="secondary"
          />
        )}

        {/* [E2 광고] AdSense in-feed — 마감 임박 정책 (사용자 핵심 가치) 다음,
            관련 가이드/블로그 (보조 콘텐츠) 사이. 자연 흐름 끊지 않는 위치. */}
        {(recommended.length > 0 || deadlineSoon.length > 0) && (
          <div className="mb-10">
            <AdSlot placement="category" />
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

        {/* 자주 묻는 질문 — 콘텐츠 깊이 (AdSense 검수) + FAQPage rich card SEO */}
        {hub.faq && hub.faq.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[20px] font-bold text-grey-900 mb-4">
              {hub.shortLabel} 자주 묻는 질문
            </h2>
            <div className="bg-white border border-grey-200 rounded-2xl divide-y divide-grey-100">
              {hub.faq.map((item, idx) => (
                <details key={idx} className="group p-5">
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                    <span className="text-[15px] font-semibold text-grey-900 leading-[1.5]">
                      {item.q}
                    </span>
                    <span className="text-grey-500 text-[18px] leading-none mt-0.5 group-open:rotate-180 transition-transform">
                      ⌃
                    </span>
                  </summary>
                  <p className="mt-3 text-[14px] text-grey-700 leading-[1.7]">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-grey-500">
              * 본 답변은 일반적 안내입니다. 실제 자격·금액·신청 절차는 각 정책의 원문 사이트에서 최종 확인하세요.
            </p>
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
