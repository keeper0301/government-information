// ============================================================
// /popular — 인기정책 (스마트 랭킹 + 마감 임박 섹션 + 필터)
// ============================================================
// 단순 누적 조회수 → 마감 가중 score + 마감 임박 별도 섹션 + 분야·지역 필터.
// 기존 단조로운 TOP 20 → 두 섹션 구조 + 사용자가 본인 조건으로 좁힐 수 있게.
//
// URL 쿼리:
//   ?tab=welfare|loan       (기본 welfare)
//   ?category=청년·소상공인·... (기본 전체)
//   ?region=전남·서울·... (기본 전국)
//   ?sort=popular|deadline   (기본 popular = 마감 가중 score)
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getPopularPrograms, getDeadlineSoonPopular } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { PROVINCE_SHORT_TO_FULL } from "@/lib/regions";

export const metadata: Metadata = {
  title: "인기정책 — 정책알리미",
  description:
    "지금 사람들이 가장 많이 보는 복지·대출 정책. 마감 임박은 별도로 강조.",
};

// 60초마다 자동 갱신 — 신규 인기 공고·마감 임박 변화 1분 내 반영
export const revalidate = 60;

type Tab = "welfare" | "loan";
type Sort = "popular" | "deadline";

// 사용자에게 노출할 분야 9개 (welfare/loan 의 category 컬럼 정확 일치)
// 정확 매칭이 어려운 카테고리 (대출 전용 "대출"·"보증" 등) 는 제외.
const CATEGORIES = [
  { value: "전체", label: "전체" },
  { value: "소득", label: "소득·수당" },
  { value: "주거", label: "주거" },
  { value: "취업", label: "취업·일자리" },
  { value: "소상공인", label: "소상공인·창업" },
  { value: "교육", label: "교육·학자금" },
  { value: "의료", label: "의료·건강" },
  { value: "양육", label: "양육·출산" },
  { value: "농업", label: "농업·어업" },
  { value: "문화", label: "문화·여가" },
] as const;

// 17개 광역 짧은 이름
const PROVINCE_SHORT_NAMES = Object.keys(PROVINCE_SHORT_TO_FULL);

type SearchParams = {
  tab?: string;
  category?: string;
  region?: string;
  sort?: string;
};

export default async function PopularPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "loan" ? "loan" : "welfare";
  const category = params.category && params.category.trim() ? params.category : "전체";
  const region = params.region && params.region.trim() ? params.region : "전국";
  const sort: Sort = params.sort === "deadline" ? "deadline" : "popular";

  // 두 섹션 데이터 병렬 조회
  const [deadlineSoon, programs] = await Promise.all([
    getDeadlineSoonPopular(tab, 5),
    getPopularPrograms({ programType: tab, category, region, sort }, 20),
  ]);

  // URL 빌더 — 기본값으로 돌아가면 쿼리 제거 (깨끗한 URL)
  function buildUrl(overrides: Partial<SearchParams>): string {
    const next: Record<string, string> = {
      ...(tab === "loan" ? { tab: "loan" } : {}),
      ...(category !== "전체" ? { category } : {}),
      ...(region !== "전국" ? { region } : {}),
      ...(sort === "deadline" ? { sort: "deadline" } : {}),
      ...Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v !== undefined),
      ) as Record<string, string>,
    };
    if (next.tab === "welfare") delete next.tab;
    if (next.category === "전체") delete next.category;
    if (next.region === "전국") delete next.region;
    if (next.sort === "popular") delete next.sort;
    const qs = new URLSearchParams(next).toString();
    return qs ? `/popular?${qs}` : `/popular`;
  }

  return (
    <main className="max-w-content mx-auto px-10 pt-[80px] pb-20 max-md:px-5">
      {/* 헤더 */}
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        인기정책
      </h1>
      <p className="text-[15px] text-grey-600 mb-10">
        지금 사람들이 가장 많이 보는 정책. 마감 임박은 위에 별도로 강조했어요.
      </p>

      {/* === 섹션 1: 마감 임박 TOP === */}
      {deadlineSoon.length > 0 && (
        <section className="mb-12 p-6 bg-blue-50 border border-blue-200 rounded-2xl">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-5">
            <h2 className="text-[18px] font-bold text-grey-900">
              ⏰ 놓치면 아쉬운 마감 임박 TOP {deadlineSoon.length}
            </h2>
            <span className="text-[12px] text-grey-600">
              D-7 이내 · 조회수 상위
            </span>
          </div>
          <div className="space-y-3">
            {deadlineSoon.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold bg-blue-500 text-white">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <ProgramRow program={p} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === 섹션 2: 전체 인기 TOP 20 === */}
      <section>
        <div className="flex items-baseline gap-3 mb-5">
          <h2 className="text-[18px] font-bold text-grey-900">📊 전체 인기 TOP 20</h2>
          <span className="text-[12px] text-grey-600">
            조회수 × 마감 가중치 (D-7 ×1.5, D-30 ×1.2)
          </span>
        </div>

        {/* 탭: 복지/대출 */}
        <div className="flex gap-2 mb-4">
          <Link
            href={buildUrl({ tab: "welfare" })}
            className={`min-h-[44px] px-5 inline-flex items-center text-[14px] font-semibold rounded-lg no-underline transition-colors ${
              tab === "welfare"
                ? "bg-grey-900 text-white"
                : "bg-grey-100 text-grey-600 hover:bg-grey-200"
            }`}
          >
            복지 TOP
          </Link>
          <Link
            href={buildUrl({ tab: "loan" })}
            className={`min-h-[44px] px-5 inline-flex items-center text-[14px] font-semibold rounded-lg no-underline transition-colors ${
              tab === "loan"
                ? "bg-grey-900 text-white"
                : "bg-grey-100 text-grey-600 hover:bg-grey-200"
            }`}
          >
            대출 TOP
          </Link>
        </div>

        {/* 분야 칩 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={buildUrl({ category: c.value })}
              className={`min-h-[36px] px-3 inline-flex items-center text-[13px] font-medium rounded-full no-underline transition-colors ${
                category === c.value
                  ? "bg-blue-500 text-white"
                  : "bg-grey-50 text-grey-700 hover:bg-grey-100"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {/* 지역·정렬 (GET 폼 — JS 무관, server-side 처리) */}
        <form
          method="get"
          action="/popular"
          className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-grey-50 rounded-xl"
        >
          {/* 현재 탭·분야 hidden 필드로 보존 */}
          {tab === "loan" && <input type="hidden" name="tab" value="loan" />}
          {category !== "전체" && (
            <input type="hidden" name="category" value={category} />
          )}
          <label className="text-[12px] text-grey-700">
            <span className="block mb-1">지역</span>
            <select
              name="region"
              defaultValue={region}
              className="px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 bg-white min-w-[120px]"
            >
              <option value="전국">전국</option>
              {PROVINCE_SHORT_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-grey-700">
            <span className="block mb-1">정렬</span>
            <select
              name="sort"
              defaultValue={sort}
              className="px-3 py-2 border border-grey-200 rounded-lg text-[13px] text-grey-900 bg-white min-w-[140px]"
            >
              <option value="popular">인기순 (마감 가중)</option>
              <option value="deadline">마감 임박순</option>
            </select>
          </label>
          <button
            type="submit"
            className="min-h-[44px] px-4 text-[13px] font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            적용
          </button>
          {(region !== "전국" || sort !== "popular") && (
            <Link
              href={buildUrl({ region: "전국", sort: "popular" })}
              className="min-h-[44px] px-4 inline-flex items-center text-[13px] font-semibold rounded-lg border border-grey-200 text-grey-700 hover:bg-grey-100 no-underline"
            >
              필터 초기화
            </Link>
          )}
          <span className="text-[12px] text-grey-600 ml-auto">
            {region === "전국" ? "전국" : region} · {category} ·{" "}
            {sort === "popular" ? "인기순" : "마감순"}
          </span>
        </form>

        {/* 결과 리스트 */}
        {programs.length > 0 ? (
          <div>
            {programs.map((program, index) => (
              <div key={program.id} className="flex items-center gap-3">
                <div
                  className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold ${
                    index < 3
                      ? "bg-blue-500 text-white"
                      : "bg-grey-100 text-grey-600"
                  }`}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <ProgramRow program={program} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-grey-50 rounded-xl text-grey-600 text-[14px]">
            조건에 맞는 정책이 없어요. 지역·분야 필터를 풀어보세요.
          </div>
        )}
      </section>
    </main>
  );
}
