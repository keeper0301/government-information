// ============================================================
// /news — 정책 소식 목록 (korea.kr 큐레이션, 공공누리 제1유형)
// ============================================================
// 카테고리 필터 (전체/정책뉴스/보도자료/정책자료) + 카드 그리드 + 페이지네이션.
// 썸네일·요약·부처 배지 포함. 공공누리 출처 표기 하단 필수.
// ============================================================

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  NewsCard,
  type NewsCardData,
  type NewsCategory,
} from "@/components/news-card";
import { Pagination } from "@/components/pagination";
import { AdSlot } from "@/components/ad-slot";

const PER_PAGE = 18; // 2×9 or 3×6 깔끔 배수

// 카테고리 필터 탭 — DB 값(news/press/policy-doc) 과 1:1 매칭
const CATEGORIES: { key: "all" | NewsCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "news", label: "정책뉴스" },
  { key: "press", label: "보도자료" },
  { key: "policy-doc", label: "정책자료" },
];

// URL 에서 들어온 카테고리 값이 유효한지 — 잘못된 값은 "전체" 로 fallback
const VALID_CATEGORIES = new Set<string>(["news", "press", "policy-doc"]);

export const metadata: Metadata = {
  title: "정책 소식 | 정책알리미",
  description:
    "korea.kr 정책뉴스·보도자료·정책자료 큐레이션. 관심 정책 발표를 한눈에.",
  alternates: { canonical: "/news" },
  openGraph: {
    title: "정책 소식 | 정책알리미",
    description: "정부 부처의 최신 정책 발표를 한눈에.",
    type: "website",
  },
};

// 5분 간격 ISR — RSS 수집 주기(일 1회) 대비 여유
export const revalidate = 300;

type Props = {
  searchParams: Promise<{ category?: string; page?: string }>;
};

export default async function NewsIndexPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeCategory =
    params.category && VALID_CATEGORIES.has(params.category)
      ? params.category
      : "all";
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const supabase = await createClient();
  let query = supabase
    .from("news_posts")
    .select(
      "slug, title, summary, category, ministry, thumbnail_url, published_at",
      { count: "exact" },
    )
    .order("published_at", { ascending: false });

  if (activeCategory !== "all") {
    query = query.eq("category", activeCategory);
  }

  const { data: posts, count } = await query.range(
    (page - 1) * PER_PAGE,
    page * PER_PAGE - 1,
  );
  const list = (posts || []) as NewsCardData[];
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  // 페이지네이션 링크 생성 — 필터 유지하며 page 만 바꿈
  function buildUrl(overrides: Record<string, string>) {
    const p = {
      category: activeCategory,
      page: String(page),
      ...overrides,
    };
    const filtered = Object.entries(p).filter(
      ([, v]) => v && v !== "all" && v !== "1",
    );
    return `/news${
      filtered.length
        ? "?" +
          filtered
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join("&")
        : ""
    }`;
  }

  return (
    <main className="min-h-screen bg-grey-50 pt-28 pb-20">
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            정책 소식
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
            정부 부처의 최신 정책 발표·보도자료·정책자료를 모았어요.
          </p>
        </header>

        {/* 카테고리 필터 탭 */}
        <nav
          className="flex flex-wrap gap-2 mb-8"
          aria-label="뉴스 카테고리 필터"
        >
          {CATEGORIES.map((cat) => {
            const selected = activeCategory === cat.key;
            return (
              <a
                key={cat.key}
                href={cat.key === "all" ? "/news" : `/news?category=${cat.key}`}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex items-center min-h-[44px] px-4 text-[14px] rounded-full no-underline transition-colors ${
                  selected
                    ? "bg-blue-500 text-white font-semibold"
                    : "bg-white text-grey-700 border border-grey-100 hover:bg-grey-50"
                }`}
              >
                {cat.label}
              </a>
            );
          })}
        </nav>

        {/* 목록 */}
        {list.length === 0 ? (
          <EmptyState isAll={activeCategory === "all"} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {list.map((post) => (
              <NewsCard key={post.slug} post={post} />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            buildUrl={buildUrl}
          />
        )}

        {/* AdSense — 그리드·페이지네이션 아래·공공누리 출처 위.
            목록 소비 마친 독자에게 자연 정지점. 연속 슬롯 배치는 AdSense
            정책 위반 위험 → 페이지당 1개만. 라이선스 영역과 광고 구분 위해
            공공누리 안내와 mt 간격. */}
        {list.length > 0 && (
          <div className="mt-10">
            <AdSlot />
          </div>
        )}

        {/* 공공누리 출처 표기 — KOGL-Type1 라이선스 의무. 페이지 하단에 명시. */}
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

// 빈 상태 — 수집 초기 혹은 필터 결과 0건
function EmptyState({ isAll }: { isAll: boolean }) {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-10 text-center">
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        {isAll
          ? "아직 수집된 뉴스가 없어요"
          : "이 카테고리의 뉴스가 없어요"}
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6]">
        매일 정부 부처에서 새 뉴스를 가져와요.
        <br />
        조금만 기다려 주세요.
      </p>
      <div className="flex justify-center gap-2 mt-5 flex-wrap">
        <a
          href="/welfare"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
        >
          복지정보 보기
        </a>
        <a
          href="/loan"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-white border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
        >
          대출정보 보기
        </a>
      </div>
    </div>
  );
}
