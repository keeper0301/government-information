import type { Metadata } from "next";
import Link from "next/link";
import {
  searchAll,
  SEARCH_TYPES,
  SEARCH_SORTS,
  type NewsHit,
  type BlogHit,
  type SearchType,
  type SearchSort,
} from "@/lib/search";
import type { DisplayProgram } from "@/lib/programs";

// /search?q=... — 통합 검색 결과 페이지
// UX 설계:
//   - 첫 화면: 영역별 20건 미리보기 (페이지 가벼움, 빠른 첫 인상)
//   - 영역 헤더: 정확한 전체 매칭 건수 표시
//   - 영역별 "전체 NNN건 보기 →" 큰 버튼 → 카테고리 페이지로 이동, 페이지네이션 활용
//   - 결과 0건 영역 자동 숨김
//   - 영역 필터 칩 (?type=welfare,loan,news,blog 단일/복수)
//   - 정렬 칩 (?sort=popular|latest|deadline) — 복지·대출 영역에만 적용

export const metadata: Metadata = {
  title: "검색 결과 — 정책알리미",
  description: "복지·대출·정책뉴스·블로그를 한 번에 검색합니다.",
};

export const dynamic = "force-dynamic";

const PREVIEW_LIMIT = 20;

// type 라벨 — 영역 필터 칩과 빈 결과 카테고리 추천에 공통 사용
const TYPE_LABEL: Record<SearchType, string> = {
  welfare: "복지",
  loan: "대출·지원금",
  news: "정책 뉴스",
  blog: "블로그",
};

const SORT_LABEL: Record<SearchSort, string> = {
  popular: "인기순",
  latest: "최신순",
  deadline: "마감 임박순",
};

// type 쿼리 파싱 — "welfare,loan" → ["welfare", "loan"]. 잘못된 값은 무시.
// 빈 배열 반환 = 영역 필터 없음 (전체) 으로 해석.
function parseTypes(raw: string | undefined): SearchType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is SearchType =>
      (SEARCH_TYPES as readonly string[]).includes(t),
    );
}

function parseSort(raw: string | undefined): SearchSort {
  if (raw && (SEARCH_SORTS as readonly string[]).includes(raw)) {
    return raw as SearchSort;
  }
  return "popular";
}

// 칩 링크 URL 빌더 — 현재 q + 다음 type/sort 로 URL 생성
function buildSearchHref(
  q: string,
  types: SearchType[],
  sort: SearchSort,
): string {
  const params = new URLSearchParams({ q });
  if (types.length > 0) params.set("type", types.join(","));
  if (sort !== "popular") params.set("sort", sort);
  return `/search?${params.toString()}`;
}

type Props = {
  searchParams: Promise<{ q?: string; type?: string; sort?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", type, sort } = await searchParams;
  const trimmed = q.trim();
  const activeTypes = parseTypes(type);
  const activeSort = parseSort(sort);
  // 정렬 칩 노출 조건: welfare 또는 loan 이 활성 영역에 포함될 때만 의미.
  // 영역 필터 미지정(전체) 도 welfare/loan 포함이므로 노출.
  const showSortChips =
    activeTypes.length === 0 ||
    activeTypes.includes("welfare") ||
    activeTypes.includes("loan");

  // 2글자 미만이면 검색 폼만 표시 (검색 미실행).
  // 헤더 메뉴 "검색" 클릭으로 q 없이 진입한 사용자에게 입력 폼 즉시 제공.
  if (trimmed.length < 2) {
    return (
      <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
          검색
        </h1>
        <p className="text-[15px] text-grey-700 leading-[1.6] mb-6">
          복지·대출·정책뉴스·블로그를 한 번에 검색해보세요.
        </p>
        <SearchInputForm initialQuery="" />
      </main>
    );
  }

  // 영역별 미리보기 20건씩 + 정확 카운트 + 영역 필터 + 정렬.
  // types 미지정 시 전체 4영역 검색, 정렬 미지정 시 popular (view_count desc).
  const data = await searchAll(trimmed, {
    welfareLimit: PREVIEW_LIMIT,
    loanLimit: PREVIEW_LIMIT,
    newsLimit: PREVIEW_LIMIT,
    blogLimit: PREVIEW_LIMIT,
    includeCount: true,
    types: activeTypes.length > 0 ? activeTypes : undefined,
    sort: activeSort,
  });

  return (
    <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 검색어 헤더 */}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
          &lsquo;{trimmed}&rsquo; 검색 결과
        </h1>
        <p className="text-[14px] text-grey-600">
          전체 {data.total.toLocaleString("ko-KR")}건이 매칭됐어요.
        </p>
      </div>

      {/* 다시 검색 — 결과 페이지 안에서도 검색어 변경 가능 (현재 query prefill) */}
      <div className="mb-4">
        <SearchInputForm initialQuery={trimmed} />
      </div>

      {/* 영역 필터 칩 — "전체" + 4 영역. URL 변경으로 즉시 재검색 */}
      <TypeFilterChips
        query={trimmed}
        active={activeTypes}
        sort={activeSort}
      />

      {/* 정렬 칩 — welfare/loan 영역 활성일 때만 (뉴스·블로그는 최신순 고정) */}
      {showSortChips && (
        <SortChips
          query={trimmed}
          types={activeTypes}
          activeSort={activeSort}
        />
      )}

      {/* 결과 0건 — 친절한 빈 상태 + 검색 팁 */}
      {data.total === 0 ? (
        <EmptyState query={trimmed} />
      ) : (
        <div className="space-y-12 mt-8">
          {data.welfareTotal > 0 && (
            <ProgramSection
              title="복지"
              total={data.welfareTotal}
              items={data.welfare}
              moreHref={`/welfare?q=${encodeURIComponent(trimmed)}`}
              tone="blue"
            />
          )}
          {data.loanTotal > 0 && (
            <ProgramSection
              title="대출·지원금"
              total={data.loanTotal}
              items={data.loan}
              moreHref={`/loan?q=${encodeURIComponent(trimmed)}`}
              tone="orange"
            />
          )}
          {data.newsTotal > 0 && (
            <NewsSection
              total={data.newsTotal}
              items={data.news}
              moreHref={`/news?q=${encodeURIComponent(trimmed)}`}
            />
          )}
          {data.blogTotal > 0 && (
            <BlogSection
              total={data.blogTotal}
              items={data.blog}
              moreHref={`/blog?q=${encodeURIComponent(trimmed)}`}
            />
          )}
        </div>
      )}
    </main>
  );
}

// 영역 필터 칩 — "전체" 1개 + 4영역 각각.
// 클릭 시 type 쿼리만 갱신 (sort 는 유지). 활성 칩은 채워진 색.
function TypeFilterChips({
  query,
  active,
  sort,
}: {
  query: string;
  active: SearchType[];
  sort: SearchSort;
}) {
  const isAllActive = active.length === 0;
  return (
    <div className="flex gap-2 flex-wrap mb-3" aria-label="영역 필터">
      <ChipLink
        href={buildSearchHref(query, [], sort)}
        active={isAllActive}
      >
        전체
      </ChipLink>
      {SEARCH_TYPES.map((t) => {
        const isActive = active.length === 1 && active[0] === t;
        return (
          <ChipLink
            key={t}
            href={buildSearchHref(query, [t], sort)}
            active={isActive}
          >
            {TYPE_LABEL[t]}
          </ChipLink>
        );
      })}
    </div>
  );
}

// 정렬 칩 — 인기순(default) / 최신순 / 마감 임박순.
function SortChips({
  query,
  types,
  activeSort,
}: {
  query: string;
  types: SearchType[];
  activeSort: SearchSort;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-2" aria-label="정렬">
      <span className="text-[12px] text-grey-500 self-center mr-1">정렬:</span>
      {SEARCH_SORTS.map((s) => (
        <ChipLink
          key={s}
          href={buildSearchHref(query, types, s)}
          active={activeSort === s}
          small
        >
          {SORT_LABEL[s]}
        </ChipLink>
      ))}
    </div>
  );
}

// 공통 칩 링크 — 영역·정렬 모두 같은 시각 디자인 (active 강조)
function ChipLink({
  href,
  active,
  small,
  children,
}: {
  href: string;
  active: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  const base = small
    ? "text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors no-underline min-h-[36px] inline-flex items-center"
    : "text-[13px] font-semibold px-4 py-2 rounded-full transition-colors no-underline min-h-[36px] inline-flex items-center";
  const tone = active
    ? "bg-blue-500 text-white hover:bg-blue-600"
    : "bg-grey-100 text-grey-700 hover:bg-grey-200";
  return (
    <Link href={href} className={`${base} ${tone}`} aria-pressed={active}>
      {children}
    </Link>
  );
}

// 페이지 내부 검색 폼 — server form (JS 없어도 동작), 현재 검색어 prefill.
// 사용자가 검색 결과 페이지에서 검색어를 빠르게 바꿀 수 있게.
function SearchInputForm({ initialQuery }: { initialQuery: string }) {
  return (
    <form method="get" action="/search" className="w-full">
      <div className="flex items-center gap-2 bg-white border-[1.5px] border-grey-200 rounded-2xl p-2 pl-5 max-w-[600px] focus-within:border-blue-500 focus-within:shadow-[0_0_0_4px_rgba(49,130,246,0.16)] transition-all">
        <input
          type="text"
          name="q"
          defaultValue={initialQuery}
          placeholder="예: 청년 월세, 소상공인 대출"
          required
          minLength={2}
          aria-label="검색어"
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-[16px] text-grey-900"
        />
        <button
          type="submit"
          className="shrink-0 h-10 px-5 bg-blue-500 text-white border-none rounded-xl text-[14px] font-bold cursor-pointer hover:bg-blue-600 transition-colors"
        >
          검색
        </button>
      </div>
    </form>
  );
}

// 결과 0건 빈 상태 — 사용자에게 검색 팁 + 카테고리 페이지 유도
function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-8 text-center mt-8">
      <div className="text-[32px] mb-3" aria-hidden>
        🔍
      </div>
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        &lsquo;{query}&rsquo; 매칭 결과가 없어요
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6] mb-5">
        다른 검색어로 다시 시도하거나, 아래 카테고리에서 둘러보세요.
      </p>

      {/* 검색 팁 — 비개발자 사용자 대상으로 흔한 실패 패턴 안내 */}
      <div className="text-left max-w-[420px] mx-auto mb-6 px-4 py-3 rounded-lg bg-grey-50 border border-grey-100">
        <div className="text-[12px] font-semibold text-grey-700 mb-1">
          검색 팁
        </div>
        <ul className="text-[12px] text-grey-600 leading-[1.6] list-disc pl-4 space-y-0.5">
          <li>띄어쓰기를 다르게 시도해보세요 (예: &ldquo;청년월세&rdquo; → &ldquo;청년 월세&rdquo;)</li>
          <li>핵심 단어 1~2개로 짧게 검색하면 더 잘 나와요</li>
          <li>한자·영어 대신 한글 일반 단어로 시도해보세요</li>
        </ul>
      </div>

      <div className="flex gap-2 justify-center flex-wrap">
        <Link
          href="/welfare"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors no-underline min-h-[36px] inline-flex items-center"
        >
          복지 정책 보기
        </Link>
        <Link
          href="/loan"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-[#FFF3E0] text-[#FB8800] hover:bg-[#FFE0B2] transition-colors no-underline min-h-[36px] inline-flex items-center"
        >
          대출·지원금 보기
        </Link>
        <Link
          href="/news"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-grey-100 text-grey-700 hover:bg-grey-200 transition-colors no-underline min-h-[36px] inline-flex items-center"
        >
          정책 뉴스 보기
        </Link>
      </div>
    </div>
  );
}

// 영역 섹션 헤더 (제목 + 카운트 + 영역 페이지 링크)
function SectionHeader({
  title,
  shown,
  total,
  moreHref,
}: {
  title: string;
  shown: number;
  total: number;
  moreHref: string;
}) {
  const hasMore = total > shown;
  return (
    <div className="flex items-baseline justify-between mb-4 gap-3">
      <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900">
        {title}
        <span className="ml-2 text-xs text-grey-500 font-normal">
          {hasMore ? `${shown}건 미리보기 · 전체 ${total.toLocaleString("ko-KR")}건` : `${total}건`}
        </span>
      </h2>
      {hasMore && (
        <Link
          href={moreHref}
          className="shrink-0 text-[13px] text-blue-500 hover:text-blue-600 underline whitespace-nowrap"
        >
          전체 보기 →
        </Link>
      )}
    </div>
  );
}

// 영역 하단 "이 영역 전체 NNN건 보기" 큰 버튼 — 더 많은 결과 있을 때만 노출
function MoreButton({ total, shown, href }: { total: number; shown: number; href: string }) {
  if (total <= shown) return null;
  const remaining = total - shown;
  return (
    <Link
      href={href}
      className="block mt-3 text-center px-5 py-3 rounded-lg bg-blue-50 text-blue-700 text-[14px] font-semibold hover:bg-blue-100 transition-colors no-underline"
    >
      이 영역 전체 {total.toLocaleString("ko-KR")}건 보기
      <span className="text-[12px] font-normal opacity-80 ml-2">
        ({remaining.toLocaleString("ko-KR")}건 더)
      </span>
    </Link>
  );
}

// 복지 / 대출 정책 영역
function ProgramSection({
  title,
  total,
  items,
  moreHref,
  tone,
}: {
  title: string;
  total: number;
  items: DisplayProgram[];
  moreHref: string;
  tone: "blue" | "orange";
}) {
  const badgeClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : "bg-[#FFF3E0] text-[#FB8800]";

  return (
    <section>
      <SectionHeader title={title} shown={items.length} total={total} moreHref={moreHref} />
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={`${it.type}-${it.id}`}>
            <Link
              href={`/${it.type}/${it.id}`}
              className="block px-4 py-3 rounded-lg border border-grey-100 bg-white hover:bg-grey-50 transition-colors no-underline"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}
                >
                  {it.category}
                </span>
                {it.dday !== null && it.dday !== undefined && (
                  <span className="text-[11px] text-grey-500">
                    {it.dday < 0
                      ? "마감"
                      : it.dday === 0
                      ? "오늘 마감"
                      : `D-${it.dday}`}
                  </span>
                )}
              </div>
              <div className="text-[15px] font-semibold text-grey-900 line-clamp-2 mb-1">
                {it.title}
              </div>
              {it.description && (
                <p className="text-[13px] text-grey-600 line-clamp-2 leading-[1.5]">
                  {it.description}
                </p>
              )}
              <div className="text-[11px] text-grey-500 mt-1">
                출처: {it.source}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <MoreButton total={total} shown={items.length} href={moreHref} />
    </section>
  );
}

// 정책 뉴스 영역
function NewsSection({
  total,
  items,
  moreHref,
}: {
  total: number;
  items: NewsHit[];
  moreHref: string;
}) {
  return (
    <section>
      <SectionHeader title="정책 뉴스" shown={items.length} total={total} moreHref={moreHref} />
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.slug}>
            <Link
              href={`/news/${it.slug}`}
              className="block px-4 py-3 rounded-lg border border-grey-100 bg-white hover:bg-grey-50 transition-colors no-underline"
            >
              <div className="text-[15px] font-semibold text-grey-900 line-clamp-2 mb-1">
                {it.title}
              </div>
              {it.summary && (
                <p className="text-[13px] text-grey-600 line-clamp-2 leading-[1.5]">
                  {it.summary}
                </p>
              )}
              <div className="text-[11px] text-grey-500 mt-1">
                {it.ministry ?? "정부 부처"} ·{" "}
                {new Date(it.published_at).toLocaleDateString("ko-KR")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <MoreButton total={total} shown={items.length} href={moreHref} />
    </section>
  );
}

// 블로그 영역
function BlogSection({
  total,
  items,
  moreHref,
}: {
  total: number;
  items: BlogHit[];
  moreHref: string;
}) {
  return (
    <section>
      <SectionHeader title="블로그" shown={items.length} total={total} moreHref={moreHref} />
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.slug}>
            <Link
              href={`/blog/${it.slug}`}
              className="block px-4 py-3 rounded-lg border border-grey-100 bg-white hover:bg-grey-50 transition-colors no-underline"
            >
              <div className="text-[15px] font-semibold text-grey-900 line-clamp-2 mb-1">
                {it.title}
              </div>
              {it.meta_description && (
                <p className="text-[13px] text-grey-600 line-clamp-2 leading-[1.5]">
                  {it.meta_description}
                </p>
              )}
              <div className="text-[11px] text-grey-500 mt-1">
                {new Date(it.published_at).toLocaleDateString("ko-KR")}
                {it.reading_time_min ? ` · ${it.reading_time_min}분 읽기` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <MoreButton total={total} shown={items.length} href={moreHref} />
    </section>
  );
}
