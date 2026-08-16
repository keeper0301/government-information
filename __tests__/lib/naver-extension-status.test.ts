import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

import { diagnoseNaverExecutionGap, getNaverExtensionStatus } from "@/lib/naver-blog/extension-status";

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
      query({
        data: [
          { error_message: "발행 모달 confirm 버튼 후보 못 찾음", skip_reason: null },
          { error_message: "발행 확인 실패: 공개 글 URL을 캡처하지 못해 성공 처리 차단", skip_reason: null },
          { error_message: "발행 모달 confirm 버튼 후보 못 찾음", skip_reason: null },
        ],
      }),
    ];
    mocks.from.mockImplementation(() => queries.shift());

    const status = await getNaverExtensionStatus();

    expect(status.queue).toMatchObject({
      pending: 0,
      retryablePending: 3,
      blockedPending: 1,
      skippedExtensionFailed: 2,
    });
    expect(status.audit24h).toMatchObject({
      success: 4,
      fail: 5,
      skipped: 6,
      failReasons: [
        { reason: "confirm_not_found", count: 2 },
        { reason: "url_capture_failed", count: 1 },
      ],
    });
    expect(status.recentAudits).toEqual([]);
    expect(status.executionGap).toMatchObject({
      status: "recent_failures",
      severity: "watch",
      attempts24h: 15,
      likelyBlocker: "recent_failures",
    });
    expect(status.errors).toEqual([
      "queue.pending: count exploded",
      "recentAudits: recent exploded",
    ]);
  });

  it("재시도 큐가 큰데 24h 시도가 0이고 최근 confirm 실패면 selector blocker로 분리한다", () => {
    const gap = diagnoseNaverExecutionGap({
      retryablePending: 784,
      success24h: 0,
      fail24h: 0,
      skipped24h: 0,
      nowMs: Date.parse("2026-08-16T08:00:00.000Z"),
      recentAudits: [
        {
          attempted_at: "2026-08-12T15:01:42.127Z",
          result: "fail",
          error_message: "발행 모달 confirm 버튼 후보 못 찾음",
          skip_reason: null,
          naver_url: null,
        },
      ],
    });

    expect(gap).toMatchObject({
      status: "confirm_selector_blocked",
      severity: "action",
      queuePressure: true,
      attempts24h: 0,
      likelyBlocker: "confirm_selector_blocked",
    });
    expect(gap.lastAttemptAgeHours).toBeGreaterThan(80);
    expect(gap.nextAction).toContain("live publish 없이 dry-run");
  });
});
