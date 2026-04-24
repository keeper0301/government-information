import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { FilterBar } from "./filter-bar";
import { Pagination } from "@/components/pagination";
import { getRegionMatchPatterns } from "@/lib/regions";

export const metadata: Metadata = {
  title: "복지 정보 — 정책알리미",
  description: "공공기관에서 제공하는 복지 프로그램을 한눈에 확인하세요.",
};

const CATEGORIES = ["전체", "주거", "취업", "양육", "의료", "소득"];
// 페이지당 20건 — 기존 10건은 7122건이 713페이지로 쪼개져 사용자 탐색 부담이 큼.
// loan/page.tsx 와 동일 수치로 통일.
const PER_PAGE = 20;

type Props = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

// 60s ISR — 운영 중 데이터/필터 fix 검증을 빠르게 보기 위함. 600s 였을 때
// 지역 드롭다운 fix 후에도 옛 결과가 10분 살아있어 검증이 어려웠음.
// keepioo 트래픽 규모에서 SSR 부하 미미.
export const revalidate = 60;

export default async function WelfarePage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category || "전체";
  const region = params.region || "전체";
  const target = params.target || "전체";
  const search = params.q || "";
  const page = parseInt(params.page || "1", 10);

  const supabase = await createClient();
  let query = supabase.from("welfare_programs").select("*", { count: "exact" });

  if (category !== "전체") query = query.eq("category", category);
  if (region !== "전체") {
    if (region === "전국") {
      // "전국" 옵션: region 값이 "전국" 인 row + region NULL (전국 단위 정책) 모두.
      query = query.or("region.eq.전국,region.is.null");
    } else {
      // UI 짧은 이름("전남") → DB 정식·짧은 이름 모두 후보로 ILIKE 매칭.
      // 광역만 저장("전라남도") + 광역+시군구 저장("전라남도 순천시") + 짧은
      // 이름 저장("전남") 어떤 형식이 와도 잡힘.
      const patterns = getRegionMatchPatterns(region);
      const orClause = patterns.map((p) => `region.ilike.%${p}%`).join(",");
      query = query.or(orClause);
    }
  }
  if (target !== "전체") query = query.ilike("target", `%${target}%`);
  if (search) {
    // 공백 기준 토큰 AND 매칭 — loan/page.tsx 와 동일 로직 (multi-word 검색 대응).
    const tokens = search
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[,()%:*]/g, ""))
      .filter((t) => t.length > 0);
    for (const token of tokens) {
      query = query.or(`title.ilike.%${token}%,description.ilike.%${token}%`);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  query = query
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  const { data, count } = await query;
  const programs = (data || []).map(welfareToDisplay);
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  function buildUrl(overrides: Record<string, string>) {
    const p = {
      category,
      region,
      target,
      q: search,
      page: String(page),
      ...overrides,
    };
    const filtered = Object.entries(p).filter(
      ([, v]) => v && v !== "전체" && v !== "1",
    );
    return `/welfare${filtered.length ? "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : ""}`;
  }

  return (
    <main className="pt-28 pb-20">
      {/* Header */}
      <section className="max-w-content mx-auto px-10 mb-8 max-md:px-6">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
          복지 정보
        </h1>
        <p className="text-[15px] text-grey-600">
          공공기관에서 제공하는 복지 프로그램을 한눈에 확인하세요.
        </p>
      </section>

      {/* Filters */}
      <section className="max-w-content mx-auto px-10 mb-6 max-md:px-6">
        {/* Category tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {CATEGORIES.map((c) => (
            <a
              key={c}
              href={buildUrl({ category: c, page: "1" })}
              className={`px-4 py-2 text-sm font-medium rounded-full no-underline transition-colors ${
                category === c
                  ? "bg-blue-500 text-white"
                  : "bg-grey-100 text-grey-700 hover:bg-grey-200"
              }`}
            >
              {c}
            </a>
          ))}
        </div>

        {/* Region + Target + Search */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Suspense fallback={null}>
              <FilterBar region={region} target={target} />
            </Suspense>
            <div className="flex-1 min-w-[200px]">
              <form action="/welfare">
                <div className="flex items-center border border-grey-200 rounded-lg overflow-hidden">
                  <input
                    type="text"
                    name="q"
                    defaultValue={search}
                    placeholder="검색어를 입력하세요"
                    className="flex-1 px-3 py-2 text-sm border-none outline-none bg-transparent text-grey-900 font-pretendard placeholder:text-grey-400"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 text-sm font-medium text-blue-500 bg-transparent border-none cursor-pointer"
                  >
                    검색
                  </button>
                </div>
                {/* Preserve current filters */}
                {category !== "전체" && (
                  <input type="hidden" name="category" value={category} />
                )}
                {region !== "전체" && (
                  <input type="hidden" name="region" value={region} />
                )}
                {target !== "전체" && (
                  <input type="hidden" name="target" value={target} />
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="max-w-content mx-auto px-10 max-md:px-6">
        <div className="text-sm text-grey-600 mb-4">
          {count || 0}개의 프로그램
        </div>
        {/* row 들을 흰 카드로 감싸 크림 배경 대비 가독성 향상 (홈 ProgramList 와 동일 스타일) */}
        {programs.length > 0 ? (
          <div className="flex flex-col bg-white border border-grey-200 rounded-2xl px-6 md:px-8 py-2">
            {programs.map((p) => (
              <ProgramRow key={p.id} program={p} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-grey-600 bg-white border border-grey-200 rounded-2xl">
            검색 결과가 없습니다.
          </div>
        )}
      </section>

      {/* Ad */}
      {programs.length > 0 && (
        <div className="mt-8">
          <AdSlot />
        </div>
      )}

      {/* Pagination */}
      <Pagination currentPage={page} totalPages={totalPages} buildUrl={buildUrl} />
    </main>
  );
}
