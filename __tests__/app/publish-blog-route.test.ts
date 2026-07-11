import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  publishOnePost: vi.fn(),
  notifyCronFailure: vi.fn(),
  logAdminAction: vi.fn(),
  sendOpsAlertMultichannel: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/blog-publish", () => ({
  getTodayCategory: (now = new Date()) => {
    const categories: Record<number, string> = {
      0: "큐레이션",
      1: "청년",
      2: "소상공인",
      3: "주거",
      4: "육아·가족",
      5: "노년",
      6: "학생·교육",
    };
    return categories[now.getDay()] ?? "청년";
  },
  publishOnePost: mocks.publishOnePost,
}));

vi.mock("@/lib/email", () => ({
  notifyCronFailure: mocks.notifyCronFailure,
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));

vi.mock("@/lib/notifications/ops-alert-multichannel", () => ({
  sendOpsAlertMultichannel: mocks.sendOpsAlertMultichannel,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

import { GET } from "@/app/api/publish-blog/route";

const OLD_CRON_SECRET = process.env.CRON_SECRET;

function restoreEnv() {
  if (OLD_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }
  process.env.CRON_SECRET = OLD_CRON_SECRET;
}

function request(url: string) {
  return new NextRequest(url, {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("publish-blog cron route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T00:00:00Z"));
    process.env.CRON_SECRET = "test-secret";
    vi.clearAllMocks();
    mocks.logAdminAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("정책 풀이 소진된 카테고리는 cron 실패 알림 없이 skipped 로 기록한다", async () => {
    mocks.publishOnePost.mockRejectedValueOnce(
      new Error(
        "발행 가능한 정책을 못 찾았어요 (카테고리: 노년). 모든 정책이 이미 글로 발행됐거나 매칭이 없어요.",
      ),
    );

    const response = await GET(
      request("https://www.keepioo.com/api/publish-blog?count=1&offset=6"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: 0, failed: 0, skipped: 1 });
    expect(body.results[0]).toMatchObject({ category: "노년", ok: false, skipped: true });
    expect(mocks.notifyCronFailure).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "blog_publish_run",
        details: expect.objectContaining({
          mode: "cron",
          success: 0,
          failed: 0,
          skipped: 1,
        }),
      }),
    );
  });

  it("모든 후보가 품질 가드로 거절된 카테고리도 cron 실패 알림 없이 skipped 로 기록한다", async () => {
    mocks.publishOnePost.mockRejectedValueOnce(
      new Error(
        "발행 가능한 고품질 정책을 못 찾았어요 (카테고리: 육아·가족). 후보 6건 모두 품질 가드로 거절됨. 마지막 오류: 본문이 너무 짧음 (549자, 최소 2000자).",
      ),
    );

    const response = await GET(
      request("https://www.keepioo.com/api/publish-blog?count=1&offset=5"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: 0, failed: 0, skipped: 1 });
    expect(body.results[0]).toMatchObject({ category: "육아·가족", ok: false, skipped: true });
    expect(mocks.notifyCronFailure).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "blog_publish_run",
        details: expect.objectContaining({
          mode: "cron",
          failed: 0,
          skipped: 1,
        }),
      }),
    );
  });

  it("LLM/인프라 실패는 기존처럼 cron 실패로 알린다", async () => {
    mocks.publishOnePost.mockRejectedValueOnce(new Error("Gemini API 500"));

    const response = await GET(
      request("https://www.keepioo.com/api/publish-blog?count=1&offset=0"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: 0, failed: 1, skipped: 0 });
    expect(mocks.notifyCronFailure).toHaveBeenCalledWith(
      "publish-blog (cron)",
      expect.stringContaining("Gemini API 500"),
      "count=1",
    );
  });
});
