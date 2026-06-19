import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

import { getNaverExtensionStatus } from "@/lib/naver-blog/extension-status";

type QueryResult = { count?: number | null; data?: unknown[] | null; error?: { message?: string } | null };

function query(result: QueryResult | Error) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: vi.fn((resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => {
      if (result instanceof Error) {
        return Promise.reject(result).then(resolve, reject);
      }
      return Promise.resolve({ count: result.count ?? null, data: result.data ?? null, error: result.error ?? null }).then(
        resolve,
        reject,
      );
    }),
    catch: vi.fn((handler: (reason: unknown) => unknown) => {
      if (result instanceof Error) return Promise.reject(result).catch(handler);
      return Promise.resolve({ count: result.count ?? null, data: result.data ?? null, error: result.error ?? null }).catch(handler);
    }),
  };
  return builder;
}

describe("getNaverExtensionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("쿼리 reject 가 있어도 상태 payload 를 반환하고 ok=false 근거를 남긴다", async () => {
    const queries = [
      query(new Error("count exploded")),
      query({ count: 3 }),
      query({ count: 1 }),
      query({ count: 2 }),
      query({ count: 4 }),
      query({ count: 5 }),
      query({ count: 6 }),
      query(new Error("recent exploded")),
    ];
    mocks.from.mockImplementation(() => queries.shift());

    const status = await getNaverExtensionStatus();

    expect(status.queue).toMatchObject({
      pending: 0,
      retryablePending: 3,
      blockedPending: 1,
      skippedExtensionFailed: 2,
    });
    expect(status.audit24h).toMatchObject({ success: 4, fail: 5, skipped: 6 });
    expect(status.recentAudits).toEqual([]);
    expect(status.errors).toEqual([
      "queue.pending: count exploded",
      "recentAudits: recent exploded",
    ]);
  });
});
