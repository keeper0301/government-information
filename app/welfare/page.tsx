import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { welfareToDisplay } from "@/lib/programs";
import { ProgramRow } from "@/components/program-row";
import { AdSlot } from "@/components/ad-slot";
import { FilterBar } from "./filter-bar";
import { Pagination } from "@/components/pagination";
import { getRegionMatchPatterns } from "@/lib/regions";
import { getProgramCategoryCounts } from "@/lib/category-counts";
import { CategoryChipBar } from "@/components/category-chip-bar";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { scoreAndFilter } from "@/lib/personalization/filter";
import {
  PERSONAL_SECTION_MIN_SCORE,
  PERSONAL_SECTION_MAX_ITEMS,
} from "@/lib/personalization/types";
import { EmptyProfilePrompt } from "@/components/personalization/EmptyProfilePrompt";
import { MatchBadge } from "@/components/personalization/MatchBadge";
import type { WelfareProgram } from "@/lib/database.types";
import { REGION_ALIASES, type ScorableItem } from "@/lib/personalization/score";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";

export const metadata: Metadata = {
  title: "복지 지원사업 — 정책알리미",
  description: "내가 받을 수 있는 정부·지자체 복지 혜택을 한곳에 모았어요.",
};

// 페이지당 20건 — 기존 10건은 7122건이 713페이지로 쪼개져 사용자 탐색 부담이 큼.
// loan/page.tsx 와 동일 수치로 통일.
const PER_PAGE = 20;

// 사용자별 개인화 분리 섹션이 있으므로 per-request SSR 강제.
// force-dynamic 없이 revalidate=60 을 쓰면 캐시된 첫 사용자의 프로필이
// 다른 사용자에게도 노출되는 보안 문제가 생김.
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

// WelfareProgram raw 행 → ScorableItem 변환
// ScorableItem 은 id/title/description/region/district/benefit_tags/apply_end/source 만 필요
// 정정 (2026-04-25 hot-fix): benefit_tags 컬럼은 실제 DB 에 있음 (031 분류 통일).
// 이전엔 manual 타입 누락으로 null 처리했지만, 이제 그대로 활용해 사용자
// benefit_tags 와 교집합 +3 점/태그 매칭이 작동.
function welfareToScorable(w: WelfareProgram): ScorableItem {
  return {
    id: w.id,
    title: w.title,
    // description + eligibility + detailed_content 합쳐서 haystack 풍성하게
    description: [w.description, w.eligibility, w.detailed_content]
      .filter(Boolean)
      .join(" "),
    region: w.region ?? null,
    district: null,                     // welfare_programs 에 district 컬럼 없음 (광역만)
    benefit_tags: w.benefit_tags ?? [],
    apply_end: w.apply_end ?? null,
    source: w.source,
    // Phase 1.5: 소득 분위 + 가구 유형 신호 — 점수 계산에 활용
    income_target_level: w.income_target_level,
    household_target_tags: w.household_target_tags ?? [],
  };
}

// age 매개변수 화이트리스트 — URL query 임의 값 차단 (PostgREST contains 에 들어감).
// AGE_TAGS (lib/tags/taxonomy.ts) 의 분류값과 일치 — 영유아·학생·청년·중장년·노년·전연령.
// 홈 대상별 카드 (HomeTargetCards) 의 청년 entry 가 정확 매칭하기 위해 추가 (2026-04-28).
const ALLOWED_AGES = new Set([
  "영유아", "학생", "청년", "중장년", "노년", "전연령",
]);

export default async function WelfarePage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category || "전체";
  const region = params.region || "전체";
  const target = params.target || "전체";
  // age — age_tags ARRAY 컬럼 contains 매칭. 화이트리스트로 SQL injection 차단.
  const rawAge = params.age || "";
  const age = ALLOWED_AGES.has(rawAge) ? rawAge : null;
  const search = params.q || "";
  const page = parseInt(params.page || "1", 10);

  const supabase = await createClient();

  // ─── 공통 필터 빌더 ──────────────────────────────────────────────────────────
  // 기존 query 와 점수 매칭용 풀 query 에 동일 필터를 중복 없이 적용하기 위한 함수
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    if (category !== "전체") q = q.eq("category", category);
    if (region !== "전체") {
      if (region === "전국") {
        q = q.or("region.eq.전국,region.is.null");
      } else {
        const patterns = getRegionMatchPatterns(region);
        const orClause = patterns.map((p) => `region.ilike.%${p}%`).join(",");
        q = q.or(orClause);
      }
    }
    if (target !== "전체") q = q.ilike("target", `%${target}%`);
    // age 필터 — age_tags ARRAY contains. PostgREST 의 cs 연산자 사용.
    // 정확 매칭 (target ilike 의 free-text 24건 vs age_tags contains 수백 건).
    if (age) q = q.contains("age_tags", [age]);
    if (search) {
      const tokens = search
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/[,()%:*]/g, ""))
        .filter((t) => t.length > 0);
      for (const token of tokens) {
        q = q.or(`title.ilike.%${token}%,description.ilike.%${token}%`);
      }
    }
    return q;
  }

  const today = new Date().toISOString().split("T")[0];

  // ─── 기존 페이지네이션 query ──────────────────────────────────────────────────
  let query = supabase
    .from("welfare_programs")
    .select("*", { count: "exact" })
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .is("duplicate_of_id", null); // 중복 정책 (Phase 3 B3) 사용자 노출 차단
  query = applyFilters(query);
  query = query
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  // 분리 섹션 pool 쿼리는 사용자 region 의존이라 profile 을 먼저 fetch.
  // 추가 RTT 1 (~50ms) 만큼만 비용 — 사장님 케이스(전남 순천시) 처럼 default
  // region="전체" pool 100건이 다른 광역으로 가득 차 분리 섹션이 항상 0건이던
  // 회귀 차단 (홈 hero hot-fix 와 동일 원리, 2026-04-26).
  const profile = await loadUserProfile();

  // ─── 점수 매칭용 풀 query (limit 100) ────────────────────────────────────────
  // 페이지네이션 없이 같은 필터 적용한 상위 100건 — 사용자 개인화 점수 계산용.
  // 사용자가 region 필터를 직접 누르면 그 선택 그대로 (자연스러움 보존).
  // region="전체" + 사용자 프로필 region 있으면 사용자 광역+전국 우선 pool 로 좁힘.
  let poolQuery = supabase
    .from("welfare_programs")
    .select("*")
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
    .is("duplicate_of_id", null); // 중복 정책 (Phase 3 B3) 사용자 노출 차단
  poolQuery = applyFilters(poolQuery);
  if (region === "전체" && profile?.signals.region) {
    const aliases = REGION_ALIASES[profile.signals.region] ?? [profile.signals.region];
    const regionOr = ["region.ilike.%전국%", ...aliases.map((a) => `region.ilike.%${a}%`)].join(",");
    poolQuery = poolQuery.or(regionOr);
  }
  poolQuery = poolQuery
    .or(`apply_end.gte.${today},apply_end.is.null`)
    .order("apply_end", { ascending: true, nullsFirst: false })
    .limit(100);

  // ─── 병렬 fetch ───────────────────────────────────────────────────────────────
  // 본 query·카테고리 카운트·풀 query 를 동시에 요청해 RTT 절약 (profile 은 위에서 처리)
  const [{ data, count }, categoryCounts, { data: poolData }] = await Promise.all([
    query,
    getProgramCategoryCounts(supabase, "welfare_programs"),
    poolQuery,
  ]);

  const programs = (data || []).map(welfareToDisplay);
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  // ─── 개인화 점수 매칭 ─────────────────────────────────────────────────────────
  // profile 이 있고 비어있지 않을 때만 점수 계산 (비로그인·빈 프로필은 skip)
  type ScoredWelfare = ReturnType<typeof scoreAndFilter<ScorableItem>>;
  let personalSection: ScoredWelfare = [];

  if (profile && !profile.isEmpty) {
    const displayPool = (poolData || []).map(welfareToScorable);
    personalSection = scoreAndFilter(displayPool, profile.signals, {
      minScore: PERSONAL_SECTION_MIN_SCORE,
      limit: PERSONAL_SECTION_MAX_ITEMS,
    });
  }

  // 분리 섹션에 노출된 id — 전체 리스트에서 MatchBadge 표시 대상 확정
  const personalIds = new Set(personalSection.map((s) => s.item.id));

  function buildUrl(overrides: Record<string, string>) {
    const p = {
      category,
      region,
      target,
      age: age ?? "",
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
          복지 지원사업
        </h1>
        <p className="text-[15px] text-grey-700 leading-[1.6]">
          내가 받을 수 있는 정부·지자체 복지 혜택을 한곳에 모았어요.
        </p>
      </section>

      {/* Filters */}
      <section className="max-w-content mx-auto px-10 mb-6 max-md:px-6">
        {/* Category tabs — DB 실측 기반 동적. 빈 카테고리 자동 숨김 + 건수 표기 */}
        <div className="mb-4">
          <CategoryChipBar
            items={categoryCounts}
            active={category}
            allHref={buildUrl({ category: "전체", page: "1" })}
            hrefFor={(c) => buildUrl({ category: c ?? "전체", page: "1" })}
          />
        </div>

        {/* Region + Target + Search — 모바일에서는 FilterBar(광역·타겟 select 2개)
            와 검색 박스가 한 줄에 다 못 들어가 우측이 59px 정도 뷰포트 밖으로
            튀어나가는 오버플로가 있었음. max-md:flex-wrap 으로 모바일에서는
            검색 박스가 다음 줄로 내려가게 허용. md+ 는 기존 동작 유지. */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0 max-md:flex-wrap">
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
                {/* 현재 필터 값을 hidden input 으로 유지 */}
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

      {/* ─── 개인화 분리 섹션 ─────────────────────────────────────────────────── */}
      {/* 위치: CategoryChipBar + 필터 바로 아래, 전체 리스트 위 */}
      <section className="max-w-content mx-auto px-10 mb-6 max-md:px-6">
        {profile && (
          <>
            {/* 케이스 1: 프로필 채워져 있고 매칭 결과 있음 → 분리 섹션 */}
            {!profile.isEmpty && personalSection.length > 0 && (
              <div className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50/40 px-6 md:px-8 py-4">
                {/* 섹션 헤더 */}
                <h2 className="text-[15px] font-bold text-grey-900 mb-3">
                  🌟 {profile.displayName}님께 맞는 정책
                  <span className="ml-2 text-[12px] font-normal text-grey-500">
                    프로필 기반 · {personalSection.length}건
                  </span>
                </h2>
                {/* row 스타일 그대로 — ProgramRow 재사용 */}
                <div className="flex flex-col bg-white border border-emerald-100 rounded-xl px-6 md:px-8 py-2">
                  {personalSection.map(({ item }) => {
                    // ScorableItem → DisplayProgram 변환 (row 렌더용)
                    // id 로 기존 programs 배열에서 찾거나, 없으면 poolData raw 에서 변환
                    const poolRaw = (poolData || []).find((w) => w.id === item.id);
                    if (!poolRaw) return null;
                    return (
                      <ProgramRow
                        key={item.id}
                        program={welfareToDisplay(poolRaw)}
                        businessProfile={profile.signals.businessProfile}
                      />
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
          </>
        )}
        {/* 케이스 4: 비로그인 → profile === null → 아무것도 안 보임 */}
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
              // MatchBadge 를 ProgramRow 오른쪽 상단에 absolute 로 겹쳐 표시
              // ProgramRow 시그니처 무변경 — relative wrapper 로만 배지 추가
              <div key={p.id} className="relative">
                <ProgramRow
                  program={p}
                  businessProfile={profile?.signals.businessProfile}
                />
                {/* 분리 섹션에 노출된 항목 → ✨ 내 조건 배지 */}
                {personalIds.has(p.id) && (
                  <div className="absolute top-4 right-0 pointer-events-none">
                    <MatchBadge />
                  </div>
                )}
              </div>
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
