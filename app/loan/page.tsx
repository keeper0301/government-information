import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { loanToDisplay } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { FilterBar } from "./filter-bar";
import { Pagination } from "@/components/pagination";
import { getRegionMatchPatterns } from "@/lib/regions";

export const metadata: Metadata = {
  title: "대출·지원금 정보 — 정책알리미",
  description: "소상공인·자영업자를 위한 정부 대출 및 지원금 정보를 확인하세요.",
};

const CATEGORIES = ["전체", "대출", "보증", "창업지원", "지원금", "소상공인지원"];
// 페이지당 20건 — 기존 10건은 1312건이 132페이지로 쪼개져 사용자 탐색 부담이 큼.
// 모바일에서도 한 화면에 5~6건이 보일 정도로 리스트 row 가 얇아 20건도 부담 적음.
const PER_PAGE = 20;

type Props = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

// 60s ISR — welfare 와 동일 사유. fix 검증·신규 공고 빠른 노출.
export const revalidate = 60;

// 지역 필터 화이트리스트 — URL 쿼리 임의 값 주입 차단 (PostgREST ilike
// interpolation 에 들어가므로 서버에서 재검증 필수).
const ALLOWED_REGIONS = new Set([
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산",
  "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
]);

export default async function LoanPage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category || "전체";
  const target = params.target || "전체";
  const rawRegion = params.region || "전체";
  const region = ALLOWED_REGIONS.has(rawRegion) ? rawRegion : "전체";
  const search = params.q || "";
  const page = parseInt(params.page || "1", 10);

  const supabase = await createClient();
  let query = supabase.from("loan_programs").select("*", { count: "exact" });

  if (category !== "전체") query = query.eq("category", category);
  if (target !== "전체") query = query.ilike("target", `%${target}%`);
  // 지역 필터 — loan_programs 에 region 컬럼이 없어 title 안 다양한 형식의
  // 광역명 표기를 OR 매칭으로 흡수.
  // 잡히는 패턴 (예: region="전남"):
  //   - "[전남] 보령시 ..." 대괄호 prefix (139건)
  //   - "(전남신용보증재단)" 괄호 안 광역명 prefix (30건 신용보증재단 패턴)
  //   - "[전라남도] ..." 정식 이름 대괄호
  //   - "(전라남도 ...)" 정식 이름 괄호
  // 못 잡는 패턴: 광역 표기 자체가 없는 1402건 (전국 단위 또는 정보 부족).
  // 이건 "그 광역에 특화된 것만" 보여주는 자연스러운 동작.
  if (region !== "전체") {
    const patterns = getRegionMatchPatterns(region); // ["전라남도", "전남"]
    const orParts: string[] = [];
    for (const p of patterns) {
      orParts.push(`title.ilike.%[${p}%`);
      orParts.push(`title.ilike.%(${p}%`);
    }
    query = query.or(orParts.join(","));
  }
  if (search) {
    // 공백 기준 토큰 AND 매칭 — "대전 소상공인 경영위기" 같은 multi-word 가
    // title "[대전] 소상공인 경영위기극복" 에 매칭되도록. 단일 substring ilike 는
    // 괄호·공백 때문에 0건으로 빠졌음. 각 토큰은 title·description 중 한 곳에라도
    // 있으면 통과(OR), 여러 토큰은 .or() 체이닝으로 AND 결합 (PostgREST 기본 동작).
    // PostgREST 특수문자(,()*% : )는 쿼리 파싱을 깨뜨리므로 사전 제거.
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
  const programs = (data || []).map(loanToDisplay);
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
    return `/loan${filtered.length ? "?" + filtered.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : ""}`;
  }

  return (
    <main className="pt-28 pb-20">
      {/* Header */}
      <section className="max-w-content mx-auto px-10 mb-8 max-md:px-6">
        <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
          대출·지원금 정보
        </h1>
        <p className="text-[15px] text-grey-600">
          소상공인·자영업자를 위한 정부 대출 및 지원금 정보를 확인하세요.
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
              className={`px-4 py-2 max-md:py-2.5 max-md:inline-flex max-md:items-center max-md:min-h-[44px] text-sm font-medium rounded-full no-underline transition-colors ${
                category === c
                  ? "bg-blue-500 text-white"
                  : "bg-grey-50 text-grey-700 hover:bg-grey-100"
              }`}
            >
              {c}
            </a>
          ))}
        </div>

        {/* Target + Search — 모바일(375px) 에서 FilterBar + 검색 박스(min-w-[200px])
            가 한 줄에 못 들어가 우측 59px 오버플로. max-md:flex-wrap 으로 검색
            박스가 다음 줄로 내려가게 허용. md+ 는 기존 한 줄 레이아웃 유지. */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0 max-md:flex-wrap">
            <Suspense fallback={null}>
              <FilterBar target={target} region={region} />
            </Suspense>
            <div className="flex-1 min-w-[200px]">
              <form action="/loan">
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
