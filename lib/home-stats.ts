// ============================================================
// 홈 통계 helper — RPC 한 번 호출 + react cache 로 같은 요청 재사용
// ============================================================
// 같은 요청 안에서 page.tsx + HeroStats 가 중복 호출해도 RPC 1회만 실행.
// 이전에 page.tsx (4 query) + HeroStats (3 query) + RegionMap (18 query)
// = 매 요청 ~25 query 가 발생하던 부하를 RPC 2 + react cache 로 통합.
// ============================================================

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ProgramCounts = {
  news_total: number;
  welfare_total: number;
  loan_total: number;
  today_new_welfare: number;
  today_new_loan: number;
  week_new_welfare: number;
  week_new_loan: number;
};

export type RegionCounts = Record<string, number>;

const EMPTY_COUNTS: ProgramCounts = {
  news_total: 0,
  welfare_total: 0,
  loan_total: 0,
  today_new_welfare: 0,
  today_new_loan: 0,
  week_new_welfare: 0,
  week_new_loan: 0,
};

// 누적·오늘·이번 주 신규 카운트. KST 기준.
export const getProgramCounts = cache(async (): Promise<ProgramCounts> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_program_counts");
  if (error || !data) {
    console.error("[home-stats] get_program_counts failed", error);
    return EMPTY_COUNTS;
  }
  return data as ProgramCounts;
});

// 시·도 + 전국 카운트. region prefix 매칭. RegionMap 용.
export const getWelfareRegionCounts = cache(async (): Promise<RegionCounts> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_welfare_region_counts");
  if (error || !data) {
    console.error("[home-stats] get_welfare_region_counts failed", error);
    return {};
  }
  return data as RegionCounts;
});
