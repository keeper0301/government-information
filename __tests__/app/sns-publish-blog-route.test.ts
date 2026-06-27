import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(() => null),
  dispatchBlogToSns: vi.fn(),
  logAdminAction: vi.fn(),
  alreadyRunError: null as null | { message: string },
}));

vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock("@/lib/sns/dispatch", () => ({ dispatchBlogToSns: mocks.dispatchBlogToSns }));
vi.mock("@/lib/admin-actions", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "blog_posts") {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.gte = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.limit = vi.fn(() => Promise.resolve({
          data: [{ id: "post-1", title: "정책 안내", slug: "policy-1", meta_description: "신청 대상과 마감을 확인하세요." }],
          error: null,
        }));
        return query;
      }
      if (table === "admin_actions") {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.gte = vi.fn(() => Promise.resolve({ data: null, error: mocks.alreadyRunError }));
        return query;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { GET } from "@/app/api/cron/sns-publish-blog/route";

function req() {
  return new Request("https://www.keepioo.com/api/cron/sns-publish-blog");
}

beforeEach(() => {
  mocks.authorizeCronRequest.mockReturnValue(null);
  mocks.dispatchBlogToSns.mockResolvedValue([{ channel: "threads", ok: true, id: "threads-1" }]);
  mocks.logAdminAction.mockResolvedValue(undefined);
  mocks.alreadyRunError = null;
});

describe("sns-publish-blog route", () => {
  it("fails closed when prior SNS run lookup fails", async () => {
    mocks.alreadyRunError = { message: "admin_actions unavailable" };

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ ok: false, error: "dedupe_query_failed: admin_actions unavailable" });
    expect(mocks.dispatchBlogToSns).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });
});
