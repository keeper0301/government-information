import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataFreshness } from "@/lib/data-freshness";
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseAnonEnv: () => true }));
vi.mock("@/lib/public-home-data", () => ({ readPublicLatestTimestamp: async () => "2026-10-06T10:00:00Z" }));
afterEach(() => vi.useRealTimers());
describe("저장된 갱신 시각의 화면 표시", () => {
  it("같은 자료 시각을 재사용해도 경과 시간은 현재 시각으로 계산한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:01:00Z"));
    expect((await getDataFreshness()).minutes_ago).toBe(1);
    vi.setSystemTime(new Date("2026-10-06T10:05:00Z"));
    expect((await getDataFreshness()).minutes_ago).toBe(5);
  });
});
