import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicProgramCategoryCounts } from "@/lib/category-counts";
import { getRegionMatchPatterns } from "@/lib/regions";
import { REGION_ALIASES } from "@/lib/personalization/region-match";
import type { LoadedProfile } from "@/lib/personalization/load-profile";
import type { WelfareProgram } from "@/lib/database.types";
import { WELFARE_EXCLUDED_FILTER } from "@/lib/listing-sources";

export type WelfareFilters = {
  category: string; region: string; target: string;
  age: string | null; search: string; page: number;
};

/** 주소의 잘못된 페이지 번호가 저장소 조회와 화면 전체를 깨뜨리지 않게 합니다. */
export function parseWelfarePage(value: string | undefined): number {
  const page = Number(value || "1");
  return Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(page * 20) ? page : 1;
}

// 카드 표시 항목만 가져옵니다. 긴 신청 본문은 상세 페이지에서 읽습니다.
const CARD_COLUMNS = "id,title,category,target,description,benefits,apply_end,source,source_code,source_url,income_target_level,household_target_tags,summary_short,unique_insight";
const RECOMMENDATION_COLUMNS = `${CARD_COLUMNS},eligibility,detailed_content,region,district,benefit_tags`;

function filteredQuery(client: SupabaseClient, columns: string, filters: WelfareFilters, today: string, count?: "exact") {
  let query = client.from("welfare_programs").select(columns, count ? { count } : undefined)
    .not("source_code", "in", WELFARE_EXCLUDED_FILTER).is("duplicate_of_id", null);
  if (filters.category !== "전체") query = query.eq("category", filters.category);
  if (filters.region === "전국") query = query.or("region.eq.전국,region.is.null");
  else if (filters.region !== "전체") query = query.or(getRegionMatchPatterns(filters.region).map(region => `region.ilike.%${region}%`).join(","));
  if (filters.target !== "전체") query = query.ilike("target", `%${filters.target}%`);
  if (filters.age) query = query.contains("age_tags", [filters.age]);
  for (const token of filters.search.trim().split(/\s+/).map(value => value.replace(/[,()%:*]/g, "")).filter(Boolean)) {
    query = query.or(`title.ilike.%${token}%,description.ilike.%${token}%`);
  }
  return query.or(`apply_end.gte.${today},apply_end.is.null`).order("apply_end", { ascending: true, nullsFirst: false });
}

// 날짜와 모든 필터를 저장 키에 포함합니다. 로그인 자료는 이 함수에 들어오지 않습니다.
const getPublicListing = unstable_cache(async (filters: WelfareFilters, today: string) => {
  const client = createPublicClient();
  const [{ data, count, error }, categoryCounts] = await Promise.all([
    filteredQuery(client, CARD_COLUMNS, filters, today, "exact").range((filters.page - 1) * 20, filters.page * 20 - 1),
    getPublicProgramCategoryCounts("welfare_programs"),
  ]);
  if (error) throw new Error("정책 목록 조회 실패", { cause: error });
  return { data: (data ?? []) as unknown as WelfareProgram[], count, categoryCounts };
}, ["public-welfare-listing-v1"], { revalidate: 60 });

export function loadWelfarePublicListing(filters: WelfareFilters) {
  return getPublicListing(filters, new Date().toISOString().slice(0, 10));
}

/** 추천 자료는 로그인 프로필이 있을 때만 새로 조회하며 공통 저장하지 않습니다. */
export async function loadWelfareRecommendationPool(client: SupabaseClient, filters: WelfareFilters, profile: LoadedProfile | null): Promise<WelfareProgram[]> {
  if (!profile || profile.isEmpty) return [];
  let query = filteredQuery(client, RECOMMENDATION_COLUMNS, filters, new Date().toISOString().slice(0, 10));
  if (filters.region === "전체" && profile.signals.region) {
    const aliases = REGION_ALIASES[profile.signals.region] ?? [profile.signals.region];
    query = query.or(["region.ilike.%전국%", ...aliases.map(region => `region.ilike.%${region}%`)].join(","));
  }
  const { data, error } = await query.limit(100);
  if (error) throw new Error("추천 정책 조회 실패", { cause: error });
  return (data ?? []) as unknown as WelfareProgram[];
}
