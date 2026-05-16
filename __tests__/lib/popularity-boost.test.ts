// ============================================================
// applyPopularityBoost 단위 테스트 (Phase A 6차)
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  applyPopularityBoost,
  getProgramPopularityScore,
  _resetPopularityCache,
} from "@/lib/personalization/popularity-boost";
import * as supabase from "@/lib/supabase/admin";

function mockEvents(events: Array<{ program_id: string; event_type: string }>) {
  vi.mocked(supabase.createAdminClient).mockReturnValue({
    from: () => ({
      select: () => ({
        gte: () => ({
          not: () => ({
            in: () => ({
              limit: () => Promise.resolve({ data: events }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof supabase.createAdminClient>);
}

describe("applyPopularityBoost", () => {
  beforeEach(() => {
    _resetPopularityCache();
    vi.clearAllMocks();
  });

  it("event 0 건 → 입력 그대로 (boost X)", async () => {
    mockEvents([]);
    const input = [
      { item: { id: "p1" }, score: 10, signals: [] },
      { item: { id: "p2" }, score: 5, signals: [] },
    ];
    const out = await applyPopularityBoost(input);
    expect(out).toEqual(input);
  });

  it("apply_click 가중치가 더 큼 (2 vs view 0.5)", async () => {
    mockEvents([
      { program_id: "p1", event_type: "apply_click" }, // p1 +2
      { program_id: "p2", event_type: "program_view" }, // p2 +0.5
      { program_id: "p2", event_type: "program_view" }, // p2 +0.5 total 1
    ]);
    const input = [
      { item: { id: "p1" }, score: 5, signals: [] },
      { item: { id: "p2" }, score: 5, signals: [] },
    ];
    const out = await applyPopularityBoost(input);
    expect(out[0].item.id).toBe("p1"); // apply 가 view 보다 강함
    expect(out[0].score).toBe(7); // 5 + 2
    expect(out[1].score).toBe(6); // 5 + 1
  });

  it("MAX_BOOST cap = 5 (매우 인기 정책도 +5 까지만)", async () => {
    // p1 apply 10건 = 20점 → cap 5 로
    const many = Array.from({ length: 10 }, () => ({
      program_id: "p1",
      event_type: "apply_click",
    }));
    mockEvents(many);
    const out = await applyPopularityBoost([{ item: { id: "p1" }, score: 10, signals: [] }]);
    expect(out[0].score).toBe(15); // 10 + 5 (cap)
  });

  it("boost 후 정렬 (score 내림차순)", async () => {
    mockEvents([{ program_id: "p2", event_type: "apply_click" }]); // p2 +2
    const input = [
      { item: { id: "p1" }, score: 10, signals: [] },
      { item: { id: "p2" }, score: 9, signals: [] }, // boost 후 11
    ];
    const out = await applyPopularityBoost(input);
    expect(out[0].item.id).toBe("p2");
    expect(out[1].item.id).toBe("p1");
  });

  it("boost 적용 시 signals 에 popularity kind push (A 7차)", async () => {
    mockEvents([
      { program_id: "p1", event_type: "apply_click" },
      { program_id: "p1", event_type: "program_view" },
    ]);
    const input = [{ item: { id: "p1" }, score: 5, signals: [] }];
    const out = await applyPopularityBoost(input);
    expect(out[0].signals.length).toBe(1);
    expect(out[0].signals[0]).toEqual({
      kind: "popularity",
      score: 2.5, // 2 (apply) + 0.5 (view)
      detail: "view 1·apply 1",
    });
  });

  it("popularity 데이터 없는 항목은 signals 변경 X", async () => {
    mockEvents([{ program_id: "p1", event_type: "apply_click" }]);
    const input = [
      { item: { id: "p1" }, score: 5, signals: [] },
      { item: { id: "p2" }, score: 5, signals: [] }, // event 없음
    ];
    const out = await applyPopularityBoost(input);
    const p2 = out.find((x) => x.item.id === "p2")!;
    expect(p2.signals.length).toBe(0);
  });
});

describe("inflight 단일화 (A 8차)", () => {
  beforeEach(() => {
    _resetPopularityCache();
    vi.clearAllMocks();
  });

  it("동시 다발 호출 시 DB query 1번만 (Promise 재사용)", async () => {
    let queryCount = 0;
    const slowFetch = () => {
      queryCount += 1;
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: [{ program_id: "p1", event_type: "apply_click" }],
            }),
          20,
        ),
      );
    };
    vi.mocked(supabase.createAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          gte: () => ({
            not: () => ({ in: () => ({ limit: slowFetch }) }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.createAdminClient>);

    // 3개 동시 호출 → 1 query 만 일어나야 함
    const [s1, s2, s3] = await Promise.all([
      getProgramPopularityScore("p1"),
      getProgramPopularityScore("p1"),
      getProgramPopularityScore("p1"),
    ]);
    expect(queryCount).toBe(1);
    expect(s1).toBe(2);
    expect(s2).toBe(2);
    expect(s3).toBe(2);
  });
});

describe("getProgramPopularityScore", () => {
  beforeEach(() => {
    _resetPopularityCache();
    vi.clearAllMocks();
  });

  it("event 없는 program → 0", async () => {
    mockEvents([]);
    expect(await getProgramPopularityScore("unknown")).toBe(0);
  });

  it("event 있는 program → 가중치 합계", async () => {
    mockEvents([
      { program_id: "p1", event_type: "apply_click" },
      { program_id: "p1", event_type: "apply_click" },
      { program_id: "p1", event_type: "program_view" },
    ]);
    expect(await getProgramPopularityScore("p1")).toBe(4.5); // 2*2 + 0.5
  });
});
