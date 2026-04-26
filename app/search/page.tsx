import type { Metadata } from "next";
import Link from "next/link";
import { searchAll, type NewsHit, type BlogHit } from "@/lib/search";
import type { DisplayProgram } from "@/lib/programs";

// /search?q=... — 통합 검색 결과 페이지
// UX 설계:
//   - 첫 화면: 영역별 20건 미리보기 (페이지 가벼움, 빠른 첫 인상)
//   - 영역 헤더: 정확한 전체 매칭 건수 표시
//   - 영역별 "전체 NNN건 보기 →" 큰 버튼 → 카테고리 페이지로 이동, 페이지네이션 활용
//   - 결과 0건 영역 자동 숨김

export const metadata: Metadata = {
  title: "검색 결과 — 정책알리미",
  description: "복지·대출·정책뉴스·블로그를 한 번에 검색합니다.",
};

export const dynamic = "force-dynamic";

const PREVIEW_LIMIT = 20;

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

  // 영역별 미리보기 20건씩 + 정확 카운트.
  // 카운트는 limit 무관 전체 매칭 건수 → "전체 NNN건 보기" 표시에 사용.
  const data = await searchAll(trimmed, {
    welfareLimit: PREVIEW_LIMIT,
    loanLimit: PREVIEW_LIMIT,
    newsLimit: PREVIEW_LIMIT,
    blogLimit: PREVIEW_LIMIT,
    includeCount: true,
  });

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
