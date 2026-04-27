// ============================================================
// /blog — 블로그 글 목록
// ============================================================
// 발행된 (published_at IS NOT NULL) 글만, 최신순.
// 카테고리 필터 (?category=청년) 지원.
// AdSense 승인용 — 사용자에게 가치 있는 정보성 글 모음.
//
// 2026-04-25 개인화 통합: welfare/loan/news 와 동일 패턴.
//   - 로그인 + 프로필 채워짐 → "🌟 ○○님께 맞는 가이드" 분리 섹션 (점수 ≥ 3, 상위 6건)
//   - 로그인 + 빈 프로필 → EmptyProfilePrompt
//   - 전체 리스트 매칭 항목 → ✨ MatchBadge
//   - blog 는 region/district/apply_end 신호 없음 → benefit_tags + 키워드만 사용
//   - category + tags 합쳐서 benefit_tags 로 변환 (score.ts 그대로 활용)
//   - minScore 3 (welfare 5 보다 낮음 — 매칭 신호가 적은 콘텐츠 특성)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BlogCard, type BlogCardData } from "@/components/blog-card";
import { getBlogCategoryCounts } from "@/lib/category-counts";
import { CategoryChipBar } from "@/components/category-chip-bar";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { scoreAndFilter } from "@/lib/personalization/filter";
import { EmptyProfilePrompt } from "@/components/personalization/EmptyProfilePrompt";
import { MatchBadge } from "@/components/personalization/MatchBadge";
import type { ScorableItem } from "@/lib/personalization/score";
import { isBlogCohortFit } from "@/lib/personalization/blog-cohort";

// 사용자별 개인화 분리 섹션이 있으므로 per-request SSR 강제.
// force-dynamic 없이 캐시하면 첫 사용자 프로필이 다른 사람에게 노출되는 보안 문제 발생.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "정책 블로그 | 정책알리미",
  description:
    "복지·대출·지원금 신청 방법을 쉽게 정리한 가이드. 매일 7글씩 새 글 발행. 마감 임박 정책 큐레이션부터 청년·소상공인·주거 카테고리까지.",
  // 네이버 D.I.A 알고리즘 키워드 시그널 — 7개 카테고리 + 주요 영역
  keywords: "복지, 대출, 지원금, 청년, 노년, 학생, 소상공인, 주거, 의료, 정책 신청, 정책 가이드",
  alternates: { canonical: "/blog" },
  authors: [{ name: "정책알리미", url: "https://www.keepioo.com" }],
  openGraph: {
    title: "정책 블로그 | 정책알리미",
    description: "복지·대출·지원금 신청 방법 가이드",
    type: "website",
    siteName: "정책알리미",
    locale: "ko_KR",
  },
};

// blog category 를 BENEFIT_TAGS 14종으로 매핑.
// blog 의 자체 분류 (청년/노년/학생·교육/소상공인) 가 BENEFIT_TAGS 와 라벨이 달라
// 사용자 benefit_tags 와 직접 매칭이 0건이던 문제 해결.
// 매핑 결정 근거 — 각 분류의 실질 수혜자 영역:
const BLOG_CATEGORY_TO_BENEFIT_TAGS: Record<string, string[]> = {
  "청년":     ["취업", "주거"],   // 청년 정책의 핵심 두 영역
  "노년":     ["의료", "생계"],   // 노년 정책의 핵심
  "학생·교육": ["교육"],
  "소상공인": ["창업", "금융"],
};

// blog_posts 행을 점수 계산 가능한 ScorableItem 으로 변환
// welfare/loan/news 와 달리 blog 는 지역·마감 신호가 없음.
// category 를 BENEFIT_TAGS 로 매핑 + tags 합쳐서 score.ts 의 태그 매칭 활용.
function blogToScorable(p: BlogCardData & { tags: string[] | null }): ScorableItem {
  const tagSet = new Set<string>();
  // category 는 매핑 테이블 통해 BENEFIT_TAGS 로 변환 (raw category 는 사용자 매칭 안 됨)
  if (p.category) {
    const mapped = BLOG_CATEGORY_TO_BENEFIT_TAGS[p.category];
    if (mapped) {
      for (const tag of mapped) tagSet.add(tag);
    } else {
      // 매핑 안 된 새 category 는 raw 그대로 추가 (BENEFIT_TAGS 와 우연히 일치할 수 있음)
      tagSet.add(p.category);
    }
  }
  // tags 는 그대로 (이미 정확한 분류 라벨일 가능성)
  for (const t of p.tags ?? []) tagSet.add(t);

  return {
    id: p.slug,
    title: p.title,
    description: p.meta_description ?? "",
    region: null,
    district: null,
    benefit_tags: Array.from(tagSet),
    apply_end: null,
    source: null,
  };
}

// blog 의 개인화 점수 임계값 — welfare/loan 의 5 보다 낮게 설정.
// 이유: region(+5/+5)·apply_end(+1) 신호가 없어 최대 점수 자체가 낮음.
// benefit_tags 1개 매칭 = +3점이 사실상 가장 강한 신호.
const BLOG_PERSONAL_MIN_SCORE = 3;
// 분리 섹션 최대 건수 — welfare 10건보다 적게 (블로그는 콘텐츠라 압박감 줄임)
const BLOG_PERSONAL_MAX_ITEMS = 6;

type SearchParams = Promise<{ category?: string; q?: string }>;

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category, q } = await searchParams;
  const activeCategory = category && category !== "all" ? category : "all";

  // 통합 검색 ?q= 토큰 AND 매칭 (lib/search.ts 와 동일 패턴)
  const queryRaw = (q ?? "").trim();
  const queryTokens = queryRaw.length >= 2
    ? queryRaw.replace(/[%_\\]/g, "\\$&").split(/\s+/).filter((t) => t.length > 0)
    : [];

  const supabase = await createClient();

  // ─── 기본 목록 query (카테고리 필터 포함) ───────────────────────────────────────
  // tags 컬럼도 추가 — 개인화 점수 계산의 benefit_tags 소스로 사용
  let query = supabase
    .from("blog_posts")
    .select("slug, title, meta_description, category, tags, reading_time_min, published_at, cover_image")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  if (activeCategory !== "all") {
    query = query.eq("category", activeCategory);
  }
  // 검색어 토큰 AND
  for (const token of queryTokens) {
    query = query.or(`title.ilike.%${token}%,meta_description.ilike.%${token}%`);
  }

  // ─── 개인화 점수용 풀 query (필터 무관 최신 100건) ───────────────────────────────
  // 카테고리 필터와 무관하게 전체에서 뽑아야 개인화 섹션이 필터에 제한받지 않음
  const poolQuery = supabase
    .from("blog_posts")
    .select("slug, title, meta_description, category, tags, reading_time_min, published_at, cover_image")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(100);

  // 본 query·카테고리 카운트·풀 query·사용자 프로필을 병렬 요청 — RTT 절약
  const [{ data: posts }, categoryCounts, { data: poolData }, profile] =
    await Promise.all([
      query,
      getBlogCategoryCounts(supabase),
      poolQuery,
      loadUserProfile(),
    ]);

  // BlogCardData 로 사용할 목록 (tags 는 BlogCard 에서 불필요하므로 포함해도 무방)
  const list = (posts || []) as (BlogCardData & { tags: string[] | null })[];

  // ─── 개인화 점수 매칭 ─────────────────────────────────────────────────────────
  // profile 이 있고 비어있지 않을 때만 점수 계산 (비로그인·빈 프로필은 skip)
  type ScoredBlog = ReturnType<typeof scoreAndFilter<ScorableItem>>;
  let personalSection: ScoredBlog = [];

  if (profile && !profile.isEmpty) {
    // ① cohort 필터로 부적합 글 제거 (30대 자영업자에 청년·학생 글 노출되던 문제 해결).
    //    score.ts 본문 기반 cohort 검사는 blog 짧은 description 으론 약해 별도 필터 적용.
    const cohortFiltered = (poolData || []).filter((p) =>
      isBlogCohortFit(
        {
          category: p.category,
          title: p.title,
          meta_description: p.meta_description,
        },
        profile.signals,
      ),
    );
    // ② 점수 매칭 — cohort 통과 글만 대상
    const scorablePool = cohortFiltered.map(
      (p) => blogToScorable(p as BlogCardData & { tags: string[] | null })
    );
    personalSection = scoreAndFilter(scorablePool, profile.signals, {
      minScore: BLOG_PERSONAL_MIN_SCORE,
      limit: BLOG_PERSONAL_MAX_ITEMS,
    });
  }

  // slug → 원본 BlogCardData 매핑 — 분리 섹션 렌더 시 원본 카드 데이터 복원용
  const poolMap = new Map(
    (poolData || []).map((p) => [p.slug, p as BlogCardData & { tags: string[] | null }])
  );

  // 분리 섹션에 노출된 slug 집합 — 전체 리스트에서 MatchBadge 표시 대상 확정
  const personalIds = new Set(personalSection.map((s) => s.item.id));

  return (
    <main className="min-h-screen bg-grey-50 pt-[80px] pb-20">
      <div className="max-w-[920px] mx-auto px-5">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            정책 블로그
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
            복지·대출·지원금 신청 방법을 쉽게 정리해드려요. 매일 1개씩 새 글 올라옵니다.
          </p>
        </header>

        {/* 카테고리 필터 — DB 실측 기반. 빈 카테고리(글 0건) 자동 숨김 */}
        <nav className="mb-8" aria-label="카테고리 필터">
          <CategoryChipBar
            items={categoryCounts}
            active={activeCategory === "all" ? null : activeCategory}
            allHref="/blog"
            hrefFor={(c) =>
              c ? `/blog?category=${encodeURIComponent(c)}` : "/blog"
            }
          />
        </nav>

        {/* ─── 개인화 분리 섹션 ────────────────────────────────────────────────── */}
        {/* 위치: 카테고리 필터 아래, 전체 리스트 위. welfare/loan/news 와 동일 UX. */}
        {profile && (
          <section className="mb-8">
            {/* 케이스 1: 프로필 채워져 있고 매칭 결과 있음 → 분리 섹션 */}
            {!profile.isEmpty && personalSection.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 md:p-6">
                {/* 섹션 헤더 */}
                <h2 className="text-[15px] font-bold text-grey-900 mb-4">
                  🌟 {profile.displayName}님께 맞는 가이드
                  <span className="ml-2 text-[12px] font-normal text-grey-500">
                    프로필 기반 · {personalSection.length}건
                  </span>
                </h2>
                {/* BlogCard 그리드 — blog 기존 2열 디자인 유지 */}
                <div className="grid gap-4 md:grid-cols-2">
                  {personalSection.map(({ item }) => {
                    // ScorableItem.id = slug → poolMap 에서 원본 BlogCardData 복원
                    const original = poolMap.get(item.id);
                    if (!original) return null;
                    return <BlogCard key={item.id} post={original} />;
                  })}
                </div>
              </div>
            )}

            {/* 케이스 2: 로그인했지만 프로필 비어있음 → 온보딩 유도 배너 */}
            {profile.isEmpty && (
              <EmptyProfilePrompt />
            )}

            {/* 케이스 3: 프로필 있지만 매칭 결과 0건 → 아무것도 안 보임 (자연스러운 폴백) */}
          </section>
        )}
        {/* 케이스 4: 비로그인 → profile === null → 아무것도 안 보임 */}

        {/* ─── 전체 글 목록 ────────────────────────────────────────────────────── */}
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((post) => (
              // MatchBadge 를 카드 우측 상단에 absolute 로 겹쳐 표시.
              // BlogCard 시그니처 무변경 — relative wrapper + absolute MatchBadge 패턴.
              <div key={post.slug} className="relative">
                <BlogCard post={post} />
                {/* 분리 섹션에 노출된 항목 → ✨ 내 조건 배지 */}
                {personalIds.has(post.slug) && (
                  <div className="absolute top-3 right-3 pointer-events-none">
                    <MatchBadge />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// 글 0개일 때 안내 (런칭 직후, 카테고리 필터 결과 없음 등)
function EmptyState() {
  return (
    <div className="bg-white border border-grey-100 rounded-2xl p-10 text-center">
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        아직 발행된 글이 없어요
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6]">
        매일 1개씩 정책 블로그 글이 올라올 예정이에요.
        <br />
        먼저 복지·대출 정보 페이지를 살펴보세요.
      </p>
      <div className="flex justify-center gap-2 mt-5">
        <Link
          href="/welfare"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600 no-underline"
        >
          복지정보 보기
        </Link>
        <Link
          href="/loan"
          className="min-h-[44px] inline-flex items-center px-5 text-[14px] font-semibold rounded-xl bg-white border border-grey-200 text-grey-700 hover:bg-grey-50 no-underline"
        >
          대출정보 보기
        </Link>
      </div>
    </div>
  );
}
