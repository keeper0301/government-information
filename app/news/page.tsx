// ============================================================
// /news — 정책 소식 목록 (korea.kr 큐레이션, 공공누리 제1유형)
// ============================================================
// 카테고리 필터 (전체/정책뉴스/정책자료) + 카드 그리드 + 페이지네이션.
// 썸네일·요약·부처 배지 포함. 공공누리 출처 표기 하단 필수.
//
// 2026-04-24 보도자료(press) 비노출: 수집 중단(lib/news-collectors/korea-kr.ts)
// + 기존 DB 건도 category != 'press' 로 모든 목록에서 제외.
//
// 2026-04-25 개인화 통합: welfare/loan 과 동일 패턴.
//   - 로그인 + 프로필 채워짐 → "🌟 ○○님께 맞는 정책" 분리 섹션 (점수 ≥ 5, 상위 10건)
//   - 로그인 + 빈 프로필 → EmptyProfilePrompt
//   - 전체 리스트 매칭 항목 → ✨ MatchBadge
//   - ministry 컬럼이 광역 단위("전라남도")일 때 region 매칭에 활용
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  NewsCard,
  type NewsCardData,
  type NewsCategory,
} from "@/components/news-card";
import { Pagination } from "@/components/pagination";
import { AdSlot } from "@/components/ad-slot";
import { PROVINCES } from "@/lib/regions";
import { getNewsBenefitTagCounts } from "@/lib/category-counts";
import { BENEFIT_TAGS } from "@/lib/tags/taxonomy";
import { CategoryChipBar } from "@/components/category-chip-bar";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { scoreAndFilter } from "@/lib/personalization/filter";
import {
  PERSONAL_SECTION_MIN_SCORE,
  PERSONAL_SECTION_MAX_ITEMS,
} from "@/lib/personalization/types";
import { EmptyProfilePrompt } from "@/components/personalization/EmptyProfilePrompt";
import { MatchBadge } from "@/components/personalization/MatchBadge";
import type { ScorableItem } from "@/lib/personalization/score";

const PER_PAGE = 18; // 2×9 or 3×6 깔끔 배수

// 유효 광역 코드 집합 — URL 임의 값 차단. ministry 컬럼 매칭에 사용.
// 네이버 뉴스 광역별 cron 수집분(ministry = "전라남도" 등) 만 잡힘.
// korea.kr 부처 뉴스(ministry = "보건복지부" 등) 는 자연스럽게 빠짐
// = "지역 뉴스만 보기" 효과.
const VALID_PROVINCE_CODES = new Set<string>(PROVINCES.map((p) => p.code));
const PROVINCE_BY_CODE: Record<string, string> = Object.fromEntries(
  PROVINCES.map((p) => [p.code, p.name]),
);

// 카테고리 필터 탭 — DB 값(news/policy-doc) 과 1:1 매칭.
// press(보도자료) 는 2026-04-24 부터 비노출.
const CATEGORIES: { key: "all" | NewsCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "news", label: "정책뉴스" },
  { key: "policy-doc", label: "정책자료" },
];

// URL 에서 들어온 카테고리 값이 유효한지 — 잘못된 값 또는 press 는 "전체" 로 fallback
const VALID_CATEGORIES = new Set<string>(["news", "policy-doc"]);

export const metadata: Metadata = {
  title: "정책 소식 | 정책알리미",
  description:
    "korea.kr 정책뉴스·정책자료 큐레이션. 관심 정책 발표를 한눈에.",
  alternates: { canonical: "/news" },
  openGraph: {
    title: "정책 소식 | 정책알리미",
    description: "정부 부처의 최신 정책 발표를 한눈에.",
    type: "website",
  },
};

// 사용자별 개인화 분리 섹션이 있으므로 per-request SSR 강제.
// force-dynamic 없이 revalidate=60 을 쓰면 캐시된 첫 사용자의 프로필이
// 다른 사용자에게도 노출되는 보안 문제가 생김.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    category?: string;
    benefit?: string; // BENEFIT_TAGS 14종 중 하나
    province?: string;
    page?: string;
  }>;
};

// BENEFIT_TAGS 단일 출처 — URL 쿼리 임의 값 차단
const VALID_BENEFITS = new Set<string>(BENEFIT_TAGS);

// news_posts 행 → ScorableItem 변환
// welfare/loan 과 달리 news 는 ministry 컬럼이 광역 단위("전라남도")로 저장됨.
// 이를 region 필드로 그대로 넘기면 score.ts 의 REGION_ALIASES 가 자동 매핑함.
// 예: ministry = "전라남도" → score.ts aliases → 사용자 region "전남" 과 매칭.
// apply_end 는 news 에 없음 (실시간 공고 개념이 아닌 단순 뉴스 콘텐츠).
function newsToScorable(p: {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  ministry: string | null;
  benefit_tags: string[] | null;
  published_at: string;
  source_url: string | null;
}): ScorableItem {
  return {
    id: p.id,
    title: p.title,
    // summary + body 합쳐서 haystack 풍성하게 — benefit_tags 키워드 매칭 정확도 향상
    description: [p.summary, p.body].filter(Boolean).join(" "),
    // ministry 가 "전라남도"처럼 광역명이면 region 매칭에 사용.
    // "보건복지부" 같은 부처명이면 REGION_ALIASES 에 없어 매칭 안 됨 (정상 동작).
    region: p.ministry,
    district: null,     // news 는 district(시군구) 개념 없음
    benefit_tags: p.benefit_tags ?? [],
    apply_end: null,    // news 는 마감 개념 없음 (실시간 뉴스 콘텐츠)
    source: p.source_url,
  };
}

export default async function NewsIndexPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeCategory =
    params.category && VALID_CATEGORIES.has(params.category)
      ? params.category
      : "all";
  // 신규 axis: benefit_tags. 기존 topic 은 deprecated (받아도 무시).
  const activeBenefit =
    params.benefit && VALID_BENEFITS.has(params.benefit) ? params.benefit : null;
  const activeProvince =
    params.province && VALID_PROVINCE_CODES.has(params.province)
      ? params.province
      : null;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const supabase = await createClient();

  // ─── 공통 필터 빌더 ──────────────────────────────────────────────────────────
  // 기존 query 와 점수 매칭용 풀 query 에 동일 필터를 중복 없이 적용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    // 보도자료(press) 는 전역 비노출 (2026-04-24~)
    q = q.neq("category", "press");
    // 품질 필터: keepioo 키워드 매칭 안 된 뉴스는 노출 제외
    q = q.not("keywords", "eq", "{}");
    if (activeCategory !== "all") q = q.eq("category", activeCategory);
    if (activeBenefit) q = q.contains("benefit_tags", [activeBenefit]);
    if (activeProvince) {
      const provinceName = PROVINCE_BY_CODE[activeProvince];
      if (provinceName) q = q.eq("ministry", provinceName);
    }
    return q;
  }

  // ─── 기존 페이지네이션 query ──────────────────────────────────────────────────
  let query = supabase
    .from("news_posts")
    .select(
      "id, slug, title, summary, category, ministry, thumbnail_url, published_at, benefit_tags",
      { count: "exact" },
    )
    .order("published_at", { ascending: false });
  query = applyFilters(query);

  // ─── 점수 매칭용 풀 query (limit 100) ────────────────────────────────────────
  // 페이지네이션 없이 같은 필터 적용한 최신 100건 — 사용자 개인화 점수 계산용.
  // category·thumbnail_url 도 함께 가져와서 분리 섹션 NewsCard 렌더에 바로 사용.
  let poolQuery = supabase
    .from("news_posts")
    .select("id, slug, title, summary, body, category, ministry, thumbnail_url, benefit_tags, published_at, source_url")
    .order("published_at", { ascending: false })
    .limit(100);
  poolQuery = applyFilters(poolQuery);

  // ─── 병렬 fetch ───────────────────────────────────────────────────────────────
  // 본 query·분야 카운트·풀 query·사용자 프로필을 동시에 요청해 RTT 절약
  const [{ data: posts, count }, benefitCounts, { data: poolData }, profile] =
    await Promise.all([
      query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1),
      getNewsBenefitTagCounts(supabase),
      poolQuery,
      loadUserProfile(),
    ]);

  const list = (posts || []) as (NewsCardData & { id: string; benefit_tags: string[] | null })[];
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  // ─── 개인화 점수 매칭 ─────────────────────────────────────────────────────────
  // profile 이 있고 비어있지 않을 때만 점수 계산 (비로그인·빈 프로필은 skip)
  type ScoredNews = ReturnType<typeof scoreAndFilter<ScorableItem>>;
  let personalSection: ScoredNews = [];

  if (profile && !profile.isEmpty) {
    const displayPool = (poolData || []).map(newsToScorable);
    personalSection = scoreAndFilter(displayPool, profile.signals, {
      minScore: PERSONAL_SECTION_MIN_SCORE,
      limit: PERSONAL_SECTION_MAX_ITEMS,
    });
  }

  // 분리 섹션에 노출된 id — 전체 리스트에서 MatchBadge 표시 대상 확정
  const personalIds = new Set(personalSection.map((s) => s.item.id));

  // 페이지네이션 링크 생성 — 필터 유지하며 page 만 바꿈
  function buildUrl(overrides: Record<string, string>) {
    const p = {
      category: activeCategory,
      benefit: activeBenefit ?? "",
      province: activeProvince ?? "",
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

  // benefit 칩 URL — category·province 유지, benefit 만 토글
  function benefitUrl(benefit: string | null): string {
    const parts: string[] = [];
    if (activeCategory !== "all") {
      parts.push(`category=${encodeURIComponent(activeCategory)}`);
    }
    if (activeProvince) {
      parts.push(`province=${encodeURIComponent(activeProvince)}`);
    }
    if (benefit) {
      parts.push(`benefit=${encodeURIComponent(benefit)}`);
    }
    return `/news${parts.length ? "?" + parts.join("&") : ""}`;
  }

  // 광역 칩 URL — category·benefit 유지, province 만 토글
  function provinceUrl(code: string | null): string {
    const parts: string[] = [];
    if (activeCategory !== "all") {
      parts.push(`category=${encodeURIComponent(activeCategory)}`);
    }
    if (activeBenefit) {
      parts.push(`benefit=${encodeURIComponent(activeBenefit)}`);
    }
    if (code) {
      parts.push(`province=${encodeURIComponent(code)}`);
    }
    return `/news${parts.length ? "?" + parts.join("&") : ""}`;
  }

  return (
    <main className="min-h-screen bg-grey-50 pt-28 pb-20">
      <div className="max-w-content mx-auto px-10 max-md:px-6">
        {/* 헤더 — 우측에 정책 가이드 페이지로 가는 보조 링크. 짧은 뉴스만 보다가
            깊이 있는 가이드 글로 자연 진입할 수 있게 (이전엔 푸터에만 노출됨). */}
        <header className="mb-8 flex items-start justify-between gap-4 max-md:flex-col max-md:items-start">
          <div>
            <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
              정책 소식
            </h1>
            <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
              정부 부처의 최신 발표와 자료를 모았어요.
            </p>
          </div>
          <Link
            href="/blog"
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 text-[14px] font-semibold rounded-full bg-white text-blue-600 border border-blue-100 hover:bg-blue-50 hover:border-blue-200 no-underline transition-colors max-md:self-stretch max-md:justify-center"
          >
            📖 정책 가이드 보기 →
          </Link>
        </header>

        {/* 발행 형식 탭 (전체 / 정책뉴스 / 정책자료) */}
        <nav
          className="flex flex-wrap gap-2 mb-4"
          aria-label="뉴스 발행 형식 필터"
        >
          {CATEGORIES.map((cat) => {
            const selected = activeCategory === cat.key;
            // 탭 전환 시 benefit·province 쿼리 보존 — 사용자 선택 필터 유지
            const href = (() => {
              const parts: string[] = [];
              if (cat.key !== "all") parts.push(`category=${cat.key}`);
              if (activeBenefit) parts.push(`benefit=${encodeURIComponent(activeBenefit)}`);
              if (activeProvince) parts.push(`province=${encodeURIComponent(activeProvince)}`);
              return `/news${parts.length ? "?" + parts.join("&") : ""}`;
            })();
            return (
              <a
                key={cat.key}
                href={href}
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

        {/* 분야 칩 — benefit_tags (BENEFIT_TAGS 14종) 기반.
            기존 topic_categories 는 11295/11413 (99%) 가 NULL 이라 사실상 무력했음.
            이제 사이트 전체 (welfare/loan/news) 가 같은 14종 축으로 통일됨. */}
        <section
          aria-label="뉴스 분야 필터"
          className="mb-8 bg-white rounded-2xl border border-grey-100 p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.4px]">
              분야로 찾기
            </h2>
            {activeBenefit && (
              <a
                href={benefitUrl(null)}
                className="text-[13px] text-blue-600 hover:text-blue-700 no-underline"
              >
                필터 해제
              </a>
            )}
          </div>
          <CategoryChipBar
            variant="filter"
            items={benefitCounts}
            active={activeBenefit}
            hrefFor={(c, selected) => benefitUrl(selected ? null : c)}
          />
        </section>

        {/* 지역 필터 — 17 광역 칩. 네이버 뉴스 광역별 cron 수집분 만 잡힘
            (korea.kr 부처 뉴스는 ministry = 부처명이라 자연 제외 = "지역
            뉴스만 보기" 효과). 칩 클릭 시 같은 광역 재클릭 = 해제. */}
        <section
          aria-label="뉴스 지역 필터"
          className="mb-8 bg-white rounded-2xl border border-grey-100 p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-[17px] font-bold text-grey-900 tracking-[-0.4px]">
              지역으로 찾기
            </h2>
            {activeProvince && (
              <a
                href={provinceUrl(null)}
                className="text-[13px] text-blue-600 hover:text-blue-700 no-underline"
              >
                필터 해제
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROVINCES.map((p) => {
              const selected = activeProvince === p.code;
              // 짧은 라벨 — UI 좁음 회피. 표준 약칭 (전라남도→전남, 경상북도→경북)
              // 을 쓰기 위해 도(道) 광역 6곳만 명시 매핑. 나머지는 접미사 제거.
              const DO_SHORT: Record<string, string> = {
                충청북도: "충북",
                충청남도: "충남",
                전라북도: "전북",
                전라남도: "전남",
                경상북도: "경북",
                경상남도: "경남",
              };
              const shortLabel =
                DO_SHORT[p.name] ||
                p.name
                  .replace(/특별시|광역시|특별자치시|특별자치도/, "")
                  .replace(/도$/, "");
              return (
                <a
                  key={p.code}
                  href={provinceUrl(selected ? null : p.code)}
                  aria-current={selected ? "page" : undefined}
                  className={`inline-flex items-center min-h-[32px] px-3 text-[13px] rounded-full no-underline transition-colors ${
                    selected
                      ? "bg-grey-900 text-white font-semibold"
                      : "bg-grey-50 text-grey-700 border border-grey-100 hover:bg-grey-100"
                  }`}
                >
                  {shortLabel}
                </a>
              );
            })}
          </div>
        </section>

        {/* ─── 개인화 분리 섹션 ─────────────────────────────────────────────────── */}
        {/* 위치: 필터 아래, 전체 리스트 위. welfare/loan 과 동일 UX. */}
        {/* news 는 카드 그리드이므로 분리 섹션도 NewsCard 그리드 사용 — 디자인 일관성 */}
        {profile && (
          <section className="mb-8">
            {/* 케이스 1: 프로필 채워져 있고 매칭 결과 있음 → 분리 섹션 */}
            {!profile.isEmpty && personalSection.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 md:p-6">
                {/* 섹션 헤더 */}
                <h2 className="text-[15px] font-bold text-grey-900 mb-4">
                  🌟 {profile.displayName}님께 맞는 정책
                  <span className="ml-2 text-[12px] font-normal text-grey-500">
                    프로필 기반 · {personalSection.length}건
                  </span>
                </h2>
                {/* NewsCard 그리드 — welfare 처럼 emerald wrapper 안에 배치 */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {personalSection.map(({ item }) => {
                    // ScorableItem id 로 poolData 에서 원본 row 를 찾아 NewsCard 에 넘김
                    const poolRaw = (poolData || []).find((n) => n.id === item.id);
                    if (!poolRaw) return null;
                    // poolQuery 에 category·thumbnail_url 포함 → NewsCardData 직접 구성
                    const cardData: NewsCardData = {
                      slug: poolRaw.slug,
                      title: poolRaw.title,
                      summary: poolRaw.summary ?? null,
                      category: (poolRaw.category ?? "news") as NewsCardData["category"],
                      ministry: poolRaw.ministry ?? null,
                      thumbnail_url: poolRaw.thumbnail_url ?? null,
                      published_at: poolRaw.published_at,
                    };
                    return (
                      <NewsCard key={item.id} post={cardData} />
                    );
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

        {/* 목록 */}
        {list.length === 0 ? (
          <EmptyState isAll={activeCategory === "all"} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {list.map((post) => (
              // MatchBadge 를 카드 우측 상단에 absolute 로 겹쳐 표시.
              // NewsCard 시그니처 무변경 — relative wrapper + absolute MatchBadge 패턴.
              <div key={post.slug} className="relative">
                <NewsCard post={post} />
                {/* 분리 섹션에 노출된 항목 → ✨ 내 조건 배지 */}
                {post.id && personalIds.has(post.id) && (
                  <div className="absolute top-3 right-3 pointer-events-none">
                    <MatchBadge />
                  </div>
                )}
              </div>
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
            정책 위반 위험 → 페이지당 1개만. */}
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
