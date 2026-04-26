import type { Metadata } from "next";
import Link from "next/link";
import { searchAll } from "@/lib/search";

// /search?q=... — 통합 검색 결과 페이지
// 복지·대출·정책뉴스·블로그 4개 영역을 한 화면에 표시.
// 사용자가 SearchBox 에서 검색 제출하면 여기로 이동.
// (이전엔 /welfare?q=... 로 가서 loan/news/blog 영역이 누락됐었음)

export const metadata: Metadata = {
  title: "검색 결과 — 정책알리미",
  description: "복지·대출·정책뉴스·블로그를 한 번에 검색합니다.",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();

  // 2글자 미만이면 안내만 표시 (검색 미실행)
  if (trimmed.length < 2) {
    return (
      <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-3">
          검색
        </h1>
        <p className="text-[15px] text-grey-700 leading-[1.6]">
          검색어를 2글자 이상 입력해 주세요. 상단 검색창에서 다시 시도하실 수 있어요.
        </p>
      </main>
    );
  }

  const data = await searchAll(trimmed);

  return (
    <main className="max-w-[920px] mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 검색어 헤더 */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
          &lsquo;{trimmed}&rsquo; 검색 결과
        </h1>
        <p className="text-[14px] text-grey-600">
          전체 {data.total.toLocaleString("ko-KR")}건이 매칭됐어요.
        </p>
      </div>

      {/* 결과 0건 — 친절한 빈 상태 */}
      {data.total === 0 ? (
        <EmptyState query={trimmed} />
      ) : (
        <div className="space-y-12">
          {/* 영역별 섹션 — 결과 있는 영역만 표시 */}
          {data.welfare.length > 0 && (
            <ProgramSection
              title="복지"
              count={data.welfare.length}
              items={data.welfare}
              moreHref={`/welfare?q=${encodeURIComponent(trimmed)}`}
              tone="blue"
            />
          )}
          {data.loan.length > 0 && (
            <ProgramSection
              title="대출·지원금"
              count={data.loan.length}
              items={data.loan}
              moreHref={`/loan?q=${encodeURIComponent(trimmed)}`}
              tone="orange"
            />
          )}
          {data.news.length > 0 && (
            <NewsSection
              count={data.news.length}
              items={data.news}
              moreHref="/news"
            />
          )}
          {data.blog.length > 0 && (
            <BlogSection
              count={data.blog.length}
              items={data.blog}
              moreHref="/blog"
            />
          )}
        </div>
      )}
    </main>
  );
}

// 결과 0건 빈 상태 — 사용자에게 다른 검색어 / 카테고리 페이지 유도
function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-8 text-center">
      <div className="text-[32px] mb-3" aria-hidden>
        🔍
      </div>
      <h2 className="text-[18px] font-bold text-grey-900 mb-2">
        &lsquo;{query}&rsquo; 매칭 결과가 없어요
      </h2>
      <p className="text-[14px] text-grey-700 leading-[1.6] mb-6">
        다른 검색어로 다시 시도하거나, 아래 카테고리에서 둘러보세요.
      </p>
      <div className="flex gap-2 justify-center flex-wrap">
        <Link
          href="/welfare"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors no-underline"
        >
          복지 정책 보기
        </Link>
        <Link
          href="/loan"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-[#FFF3E0] text-[#FB8800] hover:bg-[#FFE0B2] transition-colors no-underline"
        >
          대출·지원금 보기
        </Link>
        <Link
          href="/news"
          className="text-[13px] font-semibold px-4 py-2 rounded-full bg-grey-100 text-grey-700 hover:bg-grey-200 transition-colors no-underline"
        >
          정책 뉴스 보기
        </Link>
      </div>
    </div>
  );
}

// 복지 / 대출 정책 영역
type ProgramItem = Awaited<ReturnType<typeof searchAll>>["welfare"][number];

function ProgramSection({
  title,
  count,
  items,
  moreHref,
  tone,
}: {
  title: string;
  count: number;
  items: ProgramItem[];
  moreHref: string;
  tone: "blue" | "orange";
}) {
  const badgeClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : "bg-[#FFF3E0] text-[#FB8800]";

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900">
          {title}
          <span className="ml-2 text-xs text-grey-500 font-normal">
            {count}건
          </span>
        </h2>
        <Link
          href={moreHref}
          className="text-[13px] text-blue-500 hover:text-blue-600 underline"
        >
          전체 보기 →
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={`${it.type}-${it.id}`}>
            <Link
              href={`/${it.type}/${it.id}`}
              className="block px-4 py-3 rounded-lg border border-grey-100 bg-white hover:bg-grey-50 transition-colors no-underline"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
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
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 정책 뉴스 영역
function NewsSection({
  count,
  items,
  moreHref,
}: {
  count: number;
  items: Awaited<ReturnType<typeof searchAll>>["news"];
  moreHref: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900">
          정책 뉴스
          <span className="ml-2 text-xs text-grey-500 font-normal">{count}건</span>
        </h2>
        <Link
          href={moreHref}
          className="text-[13px] text-blue-500 hover:text-blue-600 underline"
        >
          전체 보기 →
        </Link>
      </div>
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
    </section>
  );
}

// 블로그 영역
function BlogSection({
  count,
  items,
  moreHref,
}: {
  count: number;
  items: Awaited<ReturnType<typeof searchAll>>["blog"];
  moreHref: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[20px] font-bold tracking-[-0.5px] text-grey-900">
          블로그
          <span className="ml-2 text-xs text-grey-500 font-normal">{count}건</span>
        </h2>
        <Link
          href={moreHref}
          className="text-[13px] text-blue-500 hover:text-blue-600 underline"
        >
          전체 보기 →
        </Link>
      </div>
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
    </section>
  );
}
