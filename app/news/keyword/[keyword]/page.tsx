// ============================================================
// /news/keyword/[keyword] — 특정 정책 키워드별 뉴스 피드 (SEO long-tail)
// ============================================================
// 24개 정책 키워드 각각 고유 URL 을 가져 Google 검색 유입용. 청년·소상공인·
// 지원금·월세 등 long-tail 검색어에 노출.
//
// 잘못된 키워드 (사전에 없음) 는 404. 사전의 표준 label 만 허용해 스팸·
// 무한 URL 방지.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewsCard, type NewsCardData } from "@/components/news-card";
import { Pagination } from "@/components/pagination";
import { RelatedPrograms } from "@/components/related-programs";
import { AdSlot } from "@/components/ad-slot";
import { BreadcrumbSchema } from "@/components/json-ld";
import { getAllKeywords } from "@/lib/news-keywords";
import { findRelatedPrograms } from "@/lib/news-matching";

const PER_PAGE = 18;
export const revalidate = 600; // 10분 ISR

type Props = {
  params: Promise<{ keyword: string }>;
  searchParams: Promise<{ page?: string }>;
};

// 유효 키워드 (표준 label) 집합 — 사전 외 값은 404
const VALID_KEYWORDS = new Set(getAllKeywords());

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  if (!VALID_KEYWORDS.has(decoded)) return { title: "정책 소식 — 정책알리미" };
  return {
    title: `${decoded} 정책 뉴스 | 정책알리미`,
    description: `${decoded} 관련 정부 정책 발표·보도자료·정책자료를 한눈에. 관련 공고 신청 정보까지 함께.`,
    alternates: { canonical: `/news/keyword/${encodeURIComponent(decoded)}` },
    openGraph: {
      title: `${decoded} 정책 뉴스`,
      description: `${decoded} 관련 정부 정책 발표·공고 모음`,
      type: "website",
    },
  };
}

export default async function NewsKeywordPage({ params, searchParams }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  if (!VALID_KEYWORDS.has(decoded)) notFound();

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const supabase = await createClient();

  // keywords 배열에 이 키워드가 포함된 뉴스만
  const { data: posts, count } = await supabase
    .from("news_posts")
    .select(
      "slug, title, summary, category, ministry, source_outlet, thumbnail_url, published_at",
      { count: "exact" },
    )
    .contains("keywords", [decoded])
    .order("published_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  const list = (posts || []) as NewsCardData[];
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  // 이 키워드 관련 공고 4건 — SEO 체류시간·공고 클릭 전환
  const relatedPrograms = await findRelatedPrograms({
    keywords: [decoded],
    limit: 4,
  });

  function buildUrl(overrides: Record<string, string>) {
    const p = { page: String(page), ...overrides };
    const filtered = Object.entries(p).filter(([, v]) => v && v !== "1");
    return `/news/keyword/${encodeURIComponent(decoded)}${
      filtered.length
        ? "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
        : ""
    }`;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";

  return (
    <main className="min-h-screen bg-grey-50 pt-28 pb-20">
      <BreadcrumbSchema
        items={[
          { name: "홈", url: baseUrl },
          { name: "정책소식", url: `${baseUrl}/news` },
          { name: `#${decoded}`, url: `${baseUrl}/news/keyword/${encodeURIComponent(decoded)}` },
        ]}
      />
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-grey-700 mb-6">
          <Link href="/news" className="font-medium no-underline hover:text-blue-500 transition-colors">
            정책 소식
          </Link>
          <span className="mx-2 text-grey-600">&gt;</span>
          <span className="text-grey-900 font-medium">#{decoded}</span>
        </nav>

        {/* 헤더 */}
        <header className="mb-6">
          <h1 className="text-[28px] md:text-[34px] font-extrabold text-grey-900 tracking-[-0.6px] mb-2">
            #{decoded}
          </h1>
          <p className="text-[14px] md:text-[15px] text-grey-700 leading-[1.6]">
            &apos;{decoded}&apos; 관련 정부 정책 발표·보도자료·정책자료를 모았어요.
          </p>
        </header>

        {/* 관련 공고 (목록 위에 배치 — 공고 클릭 우선) */}
        {relatedPrograms.length > 0 && (
          <div className="bg-white border border-grey-100 rounded-2xl p-5 mb-8">
            <RelatedPrograms
              programs={relatedPrograms}
              title={`지금 신청 가능한 '${decoded}' 공고`}
              hint="뉴스만 읽지 말고 바로 신청해보세요. 현재 모집 중인 공고만 추렸어요."
            />
          </div>
        )}

        {/* 뉴스 목록 */}
        {list.length === 0 ? (
          <EmptyState keyword={decoded} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {list.map((post) => (
              <NewsCard key={post.slug} post={post} />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} buildUrl={buildUrl} />
        )}

        {/* AdSense 슬롯 — 키워드별 뉴스 다 읽은 독자에게. 라이선스 안내 앞. */}
        {list.length > 0 && (
          <div className="mt-10">
            <AdSlot />
          </div>
        )}

        {/* 공공누리 출처 표기 */}
        <p className="mt-12 text-[12px] text-grey-600 leading-[1.6] text-center">
          본 페이지의 뉴스는 공공누리 제1유형(KOGL-Type1) 으로 개방된{" "}
          <a
            href="https://www.korea.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-grey-700 underline hover:text-grey-900"
          >
            정책브리핑(korea.kr)
          </a>
          의 자료를 활용합니다.
        </p>
      </div>
    </main>
  );
}

// keepioo 가 이미 생성한 키워드 목록 — Next.js 가 미리 SSG 로 페이지 생성
export async function generateStaticParams() {
  return getAllKeywords().map((k) => ({ keyword: encodeURIComponent(k) }));
}

function EmptyState({ keyword }: { keyword: string }) {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-10 text-center">
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        &apos;{keyword}&apos; 관련 뉴스가 아직 없어요
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6] mb-5">
        매일 정부 부처에서 새 뉴스를 가져와요. 조금만 기다려 주세요.
      </p>
      <Link
        href="/news"
        className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
      >
        전체 정책 소식 보기
      </Link>
    </div>
  );
}
