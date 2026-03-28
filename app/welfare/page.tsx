import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { FilterBar } from "./filter-bar";

const CATEGORIES = ["전체", "주거", "취업", "양육", "의료", "소득"];
const PER_PAGE = 10;

type Props = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

export const revalidate = 600;

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
  if (region !== "전체") query = query.eq("region", region);
  if (target !== "전체") query = query.ilike("target", `%${target}%`);
  if (search)
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`,
    );

  query = query
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
        <div className="text-sm text-grey-500 mb-4">
          {count || 0}개의 프로그램
        </div>
        <div className="flex flex-col">
          {programs.length > 0 ? (
            programs.map((p) => <ProgramRow key={p.id} program={p} />)
          ) : (
            <div className="py-20 text-center text-grey-500">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </section>

      {/* Ad */}
      {programs.length > 0 && (
        <div className="mt-8">
          <AdSlot />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <section className="max-w-content mx-auto px-10 mt-8 flex justify-center gap-2 max-md:px-6">
          {page > 1 && (
            <a
              href={buildUrl({ page: String(page - 1) })}
              className="px-4 py-2 text-sm font-medium text-grey-700 bg-grey-100 rounded-lg no-underline hover:bg-grey-200 transition-colors"
            >
              이전
            </a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={buildUrl({ page: String(p) })}
              className={`px-3 py-2 text-sm font-medium rounded-lg no-underline transition-colors ${
                p === page
                  ? "bg-blue-500 text-white"
                  : "text-grey-600 hover:bg-grey-100"
              }`}
            >
              {p}
            </a>
          ))}
          {page < totalPages && (
            <a
              href={buildUrl({ page: String(page + 1) })}
              className="px-4 py-2 text-sm font-medium text-grey-700 bg-grey-100 rounded-lg no-underline hover:bg-grey-200 transition-colors"
            >
              다음
            </a>
          )}
        </section>
      )}
    </main>
  );
}
