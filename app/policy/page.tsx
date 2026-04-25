// ============================================================
// /policy — 정책 둘러보기 허브 (4개 탭)
// ============================================================
// 헤더 메뉴 단순화 (11개 → 5개) 의 일환으로 신규 추가된 통합 진입점.
// 4개 탭(맞춤추천/복지/대출/인기) 으로 분야별 미리보기를 보여주고,
// 각 탭에서 "전체 보기 →" 로 기존 페이지로 깊이 탐색 유도.
//
// 기존 /welfare, /loan, /popular, /recommend 페이지는 그대로 유지
// (외부 링크·검색엔진 색인 보호).
//
// URL: /policy?tab=welfare|loan|popular  (디폴트 = recommend)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { RecommendTab } from "./recommend-tab";
import { CategoryTab } from "./category-tab";
import { PopularTab } from "./popular-tab";

export const metadata: Metadata = {
  title: "정책 둘러보기 — 정책알리미",
  description:
    "맞춤추천·복지·대출·인기 정책을 한 화면에서 빠르게 둘러보고, 마음에 드는 분야를 깊이 탐색하세요.",
};

// 60초 ISR — 각 탭의 미리보기 5~10개라 부담 적음. 신규 공고·인기 변동 1분 내 반영
export const revalidate = 60;

const TABS = [
  { key: "recommend", label: "맞춤추천" },
  { key: "welfare", label: "복지" },
  { key: "loan", label: "대출" },
  { key: "popular", label: "인기" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function isValidTab(t: string | undefined): t is Tab {
  return TABS.some((tab) => tab.key === t);
}

type SearchParams = {
  tab?: string;
};

export default async function PolicyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab: Tab = isValidTab(params.tab) ? params.tab : "recommend";

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 헤더 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        정책 둘러보기
      </h1>
      <p className="text-[15px] text-grey-600 mb-8">
        맞춤추천·복지·대출·인기 정책을 한곳에서 빠르게 살펴보세요.
      </p>

      {/* 탭 네비 — 활성 탭은 버건디 hairline (헤더 active 인디케이터와 동일 톤) */}
      <div className="flex gap-1 mb-8 border-b border-grey-200 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.key;
          // recommend 가 디폴트이므로 쿼리 없이 /policy 로 — URL 깔끔
          const href = t.key === "recommend" ? "/policy" : `/policy?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 px-4 py-3 text-[14px] transition-colors no-underline border-b-2 -mb-px min-h-[44px] flex items-center ${
                active
                  ? "text-grey-900 font-semibold"
                  : "text-grey-600 font-medium border-transparent hover:text-grey-900"
              }`}
              style={
                active ? { borderBottomColor: "#8A2A2A" } : undefined
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* 탭별 콘텐츠 — 각 탭은 별도 server component 로 분리 (이 파일 200줄 이하 유지) */}
      {tab === "recommend" && <RecommendTab />}
      {tab === "welfare" && <CategoryTab variant="welfare" />}
      {tab === "loan" && <CategoryTab variant="loan" />}
      {tab === "popular" && <PopularTab />}
    </main>
  );
}
