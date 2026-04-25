// ============================================================
// /news — 정책 소식 목록 (korea.kr 큐레이션, 공공누리 제1유형)
// ============================================================
// 카테고리 필터 (전체/정책뉴스/정책자료) + 카드 그리드 + 페이지네이션.
// 썸네일·요약·부처 배지 포함. 공공누리 출처 표기 하단 필수.
//
// 2026-04-24 보도자료(press) 비노출: 수집 중단(lib/news-collectors/korea-kr.ts)
// + 기존 DB 건도 category != 'press' 로 모든 목록에서 제외.
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
import { TOPIC_CATEGORIES } from "@/lib/news-collectors/korea-kr-topics";
import { PROVINCES } from "@/lib/regions";

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

// 60s ISR — 네이버 뉴스 광역별 cron(매일 23:00~00:20 KST 5분 간격) 직후
// 신규 뉴스가 빨리 노출되도록. welfare/loan 과 동일 정책.
export const revalidate = 60;

type Props = {
  searchParams: Promise<{
    category?: string;
    topic?: string;
    province?: string;
    page?: string;
  }>;
};

// 유효 topic(주제 카테고리) 이름 집합 — URL 쿼리 임의값 차단
const VALID_TOPICS = new Set(TOPIC_CATEGORIES.map((c) => c.name));

export default async function NewsIndexPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeCategory =
    params.category && VALID_CATEGORIES.has(params.category)
      ? params.category
      : "all";
  const activeTopic =
    params.topic && VALID_TOPICS.has(params.topic) ? params.topic : null;
  const activeProvince =
    params.province && VALID_PROVINCE_CODES.has(params.province)
      ? params.province
      : null;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const supabase = await createClient();
  let query = supabase
    .from("news_posts")
    .select(
      "slug, title, summary, category, ministry, thumbnail_url, published_at",
      { count: "exact" },
    )
    // 보도자료(press) 는 전역 비노출 (2026-04-24~)
    .neq("category", "press")
    // 2026-04-24 품질 필터: keepioo 키워드 매칭 안 된 뉴스는 노출 제외.
    // 기존 DB 의 노이즈 건(베트남 수출·순방 등)도 자동으로 숨김.
    // Supabase REST "not.eq.{}" = 빈 배열 아닌 것만 = 키워드 1개 이상 있는 것만.
    .not("keywords", "eq", "{}")
    .order("published_at", { ascending: false });

  if (activeCategory !== "all") {
    query = query.eq("category", activeCategory);
  }
  // 주제 카테고리 필터 — topic_categories 배열에 해당 카테고리명이 있는 row 만.
  // `cs` (contains) 는 PostgREST 의 @> 연산자에 매핑됨.
  if (activeTopic) {
    query = query.contains("topic_categories", [activeTopic]);
  }
  // 광역 필터 — ministry 컬럼이 광역명인 row 만 (네이버 뉴스 광역별 수집분).
  if (activeProvince) {
    const provinceName = PROVINCE_BY_CODE[activeProvince];
    if (provinceName) query = query.eq("ministry", provinceName);
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
      topic: activeTopic ?? "",
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

  // 주제 칩 URL — category·province 유지, topic 만 토글
  function topicUrl(topicName: string | null): string {
    const parts: string[] = [];
    if (activeCategory !== "all") {
      parts.push(`category=${encodeURIComponent(activeCategory)}`);
    }
    if (activeProvince) {
      parts.push(`province=${encodeURIComponent(activeProvince)}`);
    }
    if (topicName) {
      parts.push(`topic=${encodeURIComponent(topicName)}`);
    }
    return `/news${parts.length ? "?" + parts.join("&") : ""}`;
  }

  // 광역 칩 URL — category·topic 유지, province 만 토글
  function provinceUrl(code: string | null): string {
    const parts: string[] = [];
    if (activeCategory !== "all") {
      parts.push(`category=${encodeURIComponent(activeCategory)}`);
    }
    if (activeTopic) {
      parts.push(`topic=${encodeURIComponent(activeTopic)}`);
    }
    if (code) {
      parts.push(`province=${encodeURIComponent(code)}`);
    }
    return `/news${parts.length ? "?" + parts.join("&") : ""}`;
  }

  // 주제 칩을 축(대상별/주제별/핫이슈)별 그룹핑
  const topicGroups = {
    target: TOPIC_CATEGORIES.filter((c) => c.axis === "target"),
    topic: TOPIC_CATEGORIES.filter((c) => c.axis === "topic"),
    hot: TOPIC_CATEGORIES.filter((c) => c.axis === "hot"),
  };

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
              정부 부처의 최신 정책 발표와 정책자료를 모았어요.
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
            // 탭 전환 시 topic·province 쿼리 보존 — 사용자 선택 필터 유지
            const href = (() => {
              const parts: string[] = [];
              if (cat.key !== "all") parts.push(`category=${cat.key}`);
              if (activeTopic) parts.push(`topic=${encodeURIComponent(activeTopic)}`);
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

        {/* 주제 카테고리 칩 — korea.kr 키워드 뉴스 15개. 대상별·주제별·핫이슈 3축
            으로 묶어 축 사이 소제목 + 작은 칩으로 구분 (탭 중복 시각 방지). */}
        <section
          aria-label="뉴스 주제 필터"
          className="mb-8 bg-white rounded-2xl border border-grey-100 p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-[14px] font-bold text-grey-900 tracking-[-0.2px]">
              주제로 찾기
            </h2>
            {activeTopic && (
              <a
                href={topicUrl(null)}
                className="text-[13px] text-blue-600 hover:text-blue-700 no-underline"
              >
                필터 해제
              </a>
            )}
          </div>
          <TopicGroup label="대상별" topics={topicGroups.target} active={activeTopic} urlFn={topicUrl} />
          <TopicGroup label="주제별" topics={topicGroups.topic} active={activeTopic} urlFn={topicUrl} />
          <TopicGroup label="핫이슈" topics={topicGroups.hot} active={activeTopic} urlFn={topicUrl} />
        </section>

        {/* 지역 필터 — 17 광역 칩. 네이버 뉴스 광역별 cron 수집분 만 잡힘
            (korea.kr 부처 뉴스는 ministry = 부처명이라 자연 제외 = "지역
            뉴스만 보기" 효과). 칩 클릭 시 같은 광역 재클릭 = 해제. */}
        <section
          aria-label="뉴스 지역 필터"
          className="mb-8 bg-white rounded-2xl border border-grey-100 p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-[14px] font-bold text-grey-900 tracking-[-0.2px]">
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
              // 예전엔 /도$/ 로 끝 '도' 만 날려서 "전라남" 같은 비대칭 약칭 생김.
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

// 주제 카테고리 한 축(대상별/주제별/핫이슈) 을 렌더하는 칩 행
function TopicGroup({
  label,
  topics,
  active,
  urlFn,
}: {
  label: string;
  topics: { id: string; name: string }[];
  active: string | null;
  urlFn: (name: string | null) => string;
}) {
  return (
    <div className="flex items-start gap-3 mb-3 last:mb-0">
      <div className="shrink-0 w-16 text-[12px] font-semibold text-grey-600 pt-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => {
          const selected = active === t.name;
          return (
            <a
              key={t.id}
              href={urlFn(selected ? null : t.name)}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex items-center min-h-[32px] px-3 text-[13px] rounded-full no-underline transition-colors ${
                selected
                  ? "bg-grey-900 text-white font-semibold"
                  : "bg-grey-50 text-grey-700 border border-grey-100 hover:bg-grey-100"
              }`}
            >
              {t.name}
            </a>
          );
        })}
      </div>
    </div>
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
