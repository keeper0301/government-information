import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { ProgramCounts, RegionCounts } from "@/lib/home-stats";

/** 성공한 공개 집계만 저장합니다. 장애를 정상적인 0건으로 저장하지 않습니다. */
export const readPublicProgramCounts = unstable_cache(async (): Promise<ProgramCounts> => {
  const { data, error } = await createPublicClient().rpc("get_program_counts");
  if (error || !data) throw new Error("정책 통계 조회 실패", { cause: error });
  return data as ProgramCounts;
}, ["public-home-program-counts-v1"], { revalidate: 60 });

export const readPublicRegionCounts = unstable_cache(async (): Promise<RegionCounts> => {
  const { data, error } = await createPublicClient().rpc("get_welfare_region_counts");
  if (error || !data) throw new Error("지역 통계 조회 실패", { cause: error });
  return data as RegionCounts;
}, ["public-home-region-counts-v1"], { revalidate: 60 });

export const readPublicLatestTimestamp = unstable_cache(async (): Promise<string | null> => {
  const client = createPublicClient();
  const responses = await Promise.all(["welfare_programs", "loan_programs", "news_posts"].map(table =>
    client.from(table).select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ));
  if (responses.some(response => response.error)) throw new Error("자료 갱신 시각 조회 실패");
  const dates = responses.map(response => response.data?.created_at).filter((date): date is string => !!date);
  return dates.sort().at(-1) ?? null;
}, ["public-latest-timestamp-v1"], { revalidate: 60 });
