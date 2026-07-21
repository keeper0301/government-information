// local-press-stats 신규 함수 분기 회귀 방어 (Major 6).
// 분모 0 방어, threshold boundary, 빈 audit 등 edge case.

import { describe, it, expect, vi, beforeEach } from "vitest";

// 단순한 mock — query 가 호출되면 미리 주입된 응답 큐에서 순서대로 반환.
const responseQueue: Array<{ count?: number | null; data?: unknown[] }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => makeBuilder(),
  }),
}));

function makeBuilder(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_, prop) {
        // then 호출 시 — Promise resolve
        if (prop === "then") {
          const next = responseQueue.shift() ?? { count: 0, data: [] };
          return (resolve: (v: typeof next) => unknown) => resolve(next);
        }
        // 나머지 chain method (select/eq/neq/gte/not/limit/order/is) — 같은 proxy 반환
        return () => proxy;
      },
    },
  );
  return proxy;
}

import {
  getNewsRatio,
  getHighNullDateCityCount,
} from "@/lib/analytics/local-press-stats";

beforeEach(() => {
  responseQueue.length = 0;
});

describe("getNewsRatio", () => {
  it("분모 0 → ratio 0, commentaryBackfillRatio 0", async () => {
    // 4 count + 1 count = 5 응답 (welfare/loan/blog/newsIndexable/newsWithCommentary)
    for (let i = 0; i < 5; i++) responseQueue.push({ count: 0 });
    const r = await getNewsRatio();
    expect(r.ratio).toBe(0);
    expect(r.commentaryBackfillRatio).toBe(0);
    expect(Number.isNaN(r.ratio)).toBe(false);
    expect(Number.isNaN(r.commentaryBackfillRatio)).toBe(false);
  });

  it("정상 비율: welfare 100 + loan 50 + blog 30 + indexable news 20 → ratio 0.1", async () => {
    responseQueue.push({ count: 100 }); // welfare
    responseQueue.push({ count: 50 }); // loan
    responseQueue.push({ count: 30 }); // blog
    responseQueue.push({ count: 20 }); // newsIndexable (summary+classified_at+ai_commentary)
    responseQueue.push({ count: 20 }); // newsWithCommentary
    const r = await getNewsRatio();
    expect(r.welfare).toBe(100);
    expect(r.newsIndexable).toBe(20);
    expect(r.ratio).toBeCloseTo(0.1, 5);
    expect(r.commentaryBackfillRatio).toBeCloseTo(1, 5);
  });

  it("newsIndexable 0 + 다른 테이블 있음 → commentaryBackfillRatio 0 (NaN 차단)", async () => {
    responseQueue.push({ count: 10 });
    responseQueue.push({ count: 10 });
    responseQueue.push({ count: 10 });
    responseQueue.push({ count: 0 }); // newsIndexable 0
    responseQueue.push({ count: 0 });
    const r = await getNewsRatio();
    expect(r.commentaryBackfillRatio).toBe(0);
  });
});

describe("getHighNullDateCityCount threshold", () => {
  it("빈 audit → 0", async () => {
    responseQueue.push({ data: [] });
    expect(await getHighNullDateCityCount(5, 24)).toBe(0);
  });

  it("정확히 threshold 5 → 1 (>= 5 통과)", async () => {
    responseQueue.push({
      data: [{ details: { city: "A", null_date: 5 } }],
    });
    expect(await getHighNullDateCityCount(5, 24)).toBe(1);
  });

  it("threshold 미달 4 → 0", async () => {
    responseQueue.push({
      data: [{ details: { city: "A", null_date: 4 } }],
    });
    expect(await getHighNullDateCityCount(5, 24)).toBe(0);
  });

  it("같은 city는 최신 audit 기준으로 판단한다", async () => {
    responseQueue.push({
      data: [
        { created_at: "2026-07-21T06:57:10Z", details: { city: "A", null_date: 0 } },
        { created_at: "2026-07-21T04:22:37Z", details: { city: "A", null_date: 10 } },
      ],
    });
    expect(await getHighNullDateCityCount(5, 24)).toBe(0);
  });

  it("3 도시 중 2 통과", async () => {
    responseQueue.push({
      data: [
        { details: { city: "A", null_date: 5 } },
        { details: { city: "B", null_date: 7 } },
        { details: { city: "C", null_date: 4 } },
      ],
    });
    expect(await getHighNullDateCityCount(5, 24)).toBe(2);
  });

  it("city 누락 row skip", async () => {
    responseQueue.push({
      data: [
        { details: { null_date: 10 } },
        { details: { city: "A", null_date: 5 } },
      ],
    });
    expect(await getHighNullDateCityCount(5, 24)).toBe(1);
  });
});
