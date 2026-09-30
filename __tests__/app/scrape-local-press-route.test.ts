// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  chunkMs: 0,
  hangs: false,
  throws: false,
  richResult: false,
  audit: vi.fn(),
  log: vi.fn(),
  admin: vi.fn(() => ({})),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/admin-actions", () => ({ logAdminAction: mocks.log }));
vi.mock("@/lib/ops/audit-cron-run", () => ({ auditCronRun: mocks.audit }));
vi.mock("@/lib/scraping/local-press/_registry", () => ({
  CITY_REGISTRY: Array.from({ length: 185 }, (_, i) => ({
    key: `key-${i}`,
    city: `city-${i}`,
    fn: async () => {
      if (mocks.calls.length % 6 === 0) {
        vi.setSystemTime(Date.now() + mocks.chunkMs);
      }
      mocks.calls.push(`city-${i}`);
      if (mocks.hangs) return new Promise(() => {});
      if (mocks.throws) throw new Error("collector failed");
      return mocks.richResult
        ? { city: `city-${i}`, fetched: 3, inserted: 2, skipped: 1, errors: ["일부 게시물 오류"], sourceCode: "source_code", latestFetched: "2026-09-30" }
        : { city: `city-${i}`, fetched: 0, inserted: 0, skipped: 0, errors: [] };
    },
  })),
}));
import { GET, POST } from "@/app/api/cron/scrape-local-press/route";

const DAY = 86_400_000;
const request = (search = "") => new Request(`https://example.test/api/cron/scrape-local-press${search}`, {
  headers: { authorization: "Bearer test-secret" },
});
const run = async () => (await GET(request())).json();

describe("지역 수집 순환과 시간 예산", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("외부 통신 금지"); }));
    mocks.calls = [];
    mocks.chunkMs = 0;
    mocks.hangs = false;
    mocks.throws = false;
    mocks.richResult = false;
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("예산 경계에서 새 묶음을 시작하지 않고 미시도 지역을 정확히 집계한다", async () => {
    mocks.chunkMs = 100_000;
    const body = await run();
    expect(mocks.calls).toHaveLength(42);
    expect(body.results).toHaveLength(185);
    expect(new Set(body.results.map((r: { city: string }) => r.city)).size).toBe(185);
    expect(body.results.filter((r: { status: string }) => r.status === "skipped_budget")).toHaveLength(143);
    expect(mocks.log).toHaveBeenCalledTimes(42);
    expect(mocks.audit).toHaveBeenCalledWith("local_press_scrape_run", expect.objectContaining({
      cities: 42, planned_cities: 185, attempted_cities: 42, completed_cities: 42,
      timed_out_cities: 0, failed_cities: 0, budget_skipped_cities: 143,
      budget_skipped: expect.any(Array),
    }));
  });

  it("하루 120곳만 시도해도 다음 날 뒤쪽까지 수집 기회가 돌아간다", async () => {
    mocks.chunkMs = 35_000;
    const first = await run();
    const firstCalls = [...mocks.calls];
    mocks.calls = [];
    vi.setSystemTime(DAY);
    const second = await run();
    expect(firstCalls).toHaveLength(120);
    expect(mocks.calls).toHaveLength(120);
    expect(new Set([...firstCalls, ...mocks.calls]).size).toBe(185);
    for (const body of [first, second]) {
      expect(new Set(body.results.map((r: { city: string }) => r.city)).size).toBe(185);
    }
  });

  it("첫 묶음만 가능한 실행을 31일 반복해도 모든 지역을 시도한다", async () => {
    const seen = new Set<string>();
    mocks.chunkMs = 700_000;
    for (let day = 0; day < 31; day++) {
      mocks.calls = [];
      vi.setSystemTime(day * DAY);
      const body = await run();
      expect(mocks.calls).toHaveLength(6);
      expect(body.results).toHaveLength(185);
      mocks.calls.forEach((city) => seen.add(city));
    }
    expect(seen.size).toBe(185);
  });

  it("정상적인 0건 결과와 마지막 불완전 묶음, 응답 계약을 유지한다", async () => {
    const body = await run();
    expect(body.ok).toBe(true);
    expect(mocks.calls).toHaveLength(185);
    expect(new Set(mocks.calls).size).toBe(185);
    expect(body.results.every((r: { status: string; errors: string[] }) => r.status === "completed" && r.errors.length === 0)).toBe(true);
    expect(POST).toBe(GET);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("지역 시간초과는 실제 시도로 기록하고 예산 미시도와 구분한다", async () => {
    mocks.hangs = true;
    const pending = run();
    await vi.advanceTimersByTimeAsync(720_000);
    const body = await pending;
    expect(mocks.calls).toHaveLength(48);
    expect(body.results.filter((r: { status: string }) => r.status === "timed_out")).toHaveLength(48);
    expect(body.results.filter((r: { status: string }) => r.status === "skipped_budget")).toHaveLength(137);
    expect(mocks.log).toHaveBeenCalledTimes(48);
  });

  it("던진 오류는 실패로 기록한다", async () => {
    mocks.throws = true;
    const body = await run();
    expect(body.results.every((r: { status: string }) => r.status === "failed")).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith("local_press_scrape_run", expect.objectContaining({ failed_cities: 185 }));
  });

  it("기존 양수 수집 결과와 오류/출처/최신 날짜를 응답과 감사에 보존한다", async () => {
    mocks.richResult = true;
    const body = await run();
    expect(body.results.every((r: { fetched: number; inserted: number; skipped: number; status: string; errors: string[]; sourceCode: string; latestFetched: string }) =>
      r.fetched === 3 && r.inserted === 2 && r.skipped === 1 && r.status === "completed" &&
      r.errors[0] === "일부 게시물 오류" && r.sourceCode === "source_code" && r.latestFetched === "2026-09-30",
    )).toBe(true);
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      fetched: 3, inserted: 2, skipped: 1, status: "completed", errors: ["일부 게시물 오류"],
      sourceCode: "source_code", latestFetched: "2026-09-30", source_code: "source_code", latest_fetched: "2026-09-30",
    }) }));
    expect(body.summary.total_inserted).toBe(370);
  });

  it("인증 실패는 수집과 DB 접근을 시작하지 않는다", async () => {
    const response = await GET(new Request("https://example.test/api/cron/scrape-local-press"));
    expect(response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.calls).toHaveLength(0);
  });

  it("지역 지정은 key/이름/중복 제거와 7곳의 요청 순서를 보존한다", async () => {
    vi.setSystemTime(DAY);
    const body = await (await GET(request("?cities=key-184,city-2,key-3,key-4,key-5,key-6,key-7,key-184"))).json();
    expect(mocks.calls).toEqual(["city-184", "city-2", "city-3", "city-4", "city-5", "city-6", "city-7"]);
    expect(body.results.map((r: { city: string }) => r.city)).toEqual(mocks.calls);
    expect(body.summary.planned_cities).toBe(7);
    expect(body.summary.attempted_cities).toBe(7);
    expect(body.summary.budget_skipped_cities).toBe(0);
  });

  it("city 단일 지정과 알 수 없는 지역의 기존 오류 계약을 보존한다", async () => {
    const response = await GET(request("?city=key-184"));
    expect(response.status).toBe(200);
    expect(mocks.calls).toEqual(["city-184"]);
    mocks.admin.mockClear();
    const invalid = await GET(request("?cities=unknown"));
    expect(invalid.status).toBe(500);
    expect((await invalid.json()).error).toContain("unknown local press city");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
