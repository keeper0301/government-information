import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWelfarePublicListing, loadWelfareRecommendationPool, parseWelfarePage } from "@/lib/welfare-listing";

const state = vi.hoisted(() => ({ selections: [] as string[], limits: [] as number[], regions: [] as string[], failure: false }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => client() }));
vi.mock("@/lib/category-counts", () => ({ getPublicProgramCategoryCounts: async () => [] }));
function client() {
  const query = {
    select: (value: string) => { state.selections.push(value); return query; },
    not: () => query, is: () => query, eq: () => query, ilike: () => query, contains: () => query,
    or: (value: string) => { state.regions.push(value); return query; }, order: () => query,
    range: async () => ({ data: [{ id: "政策" }], count: 21, error: state.failure ? new Error("조회 실패") : null }),
    limit: async (value: number) => { state.limits.push(value); return { data: [], error: null }; },
  };
  return { from: () => query };
}
const filters = { category: "전체", region: "서울", target: "전체", age: null, search: "", page: 1 };
beforeEach(() => { state.selections = []; state.limits = []; state.regions = []; state.failure = false; });
describe("공개 정책과 개인 추천 조회 분리", () => {
  it.each(["abc", "0", "-1", "Infinity", "1.5", "9007199254740992"])("잘못된 페이지 번호 %s는 첫 페이지로 돌아간다", value => {
    expect(parseWelfarePage(value)).toBe(1);
  });
  it("정상적인 페이지 번호는 유지한다", () => {
    expect(parseWelfarePage("2")).toBe(2);
  });
  it.each([null, { isEmpty: true }])("추천 조건이 없으면 저장소를 조회하지 않는다", async profile => {
    expect(await loadWelfareRecommendationPool(client() as never, filters, profile as never)).toEqual([]);
    expect(state.selections).toEqual([]);
    expect(state.limits).toEqual([]);
  });
  it("공개 목록은 필요한 항목과 정확한 전체 개수를 전달한다", async () => {
    const result = await loadWelfarePublicListing(filters);
    expect(result.count).toBe(21);
    expect(state.selections[0]).not.toBe("*");
    expect(state.selections[0]).toContain("summary_short");
    expect(state.regions.join(" ")).toContain("서울");
  });
  it("조회 실패를 빈 정상 목록으로 저장하지 않는다", async () => {
    state.failure = true;
    await expect(loadWelfarePublicListing(filters)).rejects.toThrow("조회 실패");
  });
  it("프로필이 있으면 해당 지역과 전국의 추천 자료를 가져온다", async () => {
    await loadWelfareRecommendationPool(client() as never, { ...filters, region: "전체" },
      { isEmpty: false, signals: { region: "서울" } } as never);
    expect(state.limits).toEqual([100]);
    expect(state.regions.join(" ")).toContain("전국");
    expect(state.regions.join(" ")).toContain("서울");
    for (const column of ["category", "target", "benefits", "source_code", "source_url", "summary_short", "unique_insight"]) {
      expect(state.selections[0].split(",")).toContain(column);
    }
  });
});
