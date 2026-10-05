import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), publish: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "admin@example.com" } } }) } }) }));
vi.mock("@/lib/admin-auth", () => ({ isAdminUser: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/wordpress/publisher", () => ({ publishToWordPress: mocks.publish }));

import { republishLatestBlogAction } from "@/app/admin/wordpress/actions";

const blog = { id: "892570b0-2458-4e85-8c86-60d97ec8615c", slug: "test-policy", title: "정책", content: "본문", category: "청년", tags: [], meta_description: null, admin_review_required: false, published_at: "2026-10-05T04:00:00Z" };
function query(data: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }), delete: vi.fn() };
  q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.order.mockReturnValue(q);q.limit.mockReturnValue(q);
  return q;
}
async function run() { return republishLatestBlogAction({ kind: "idle" }, new FormData()); }

describe("admin WordPress retry button", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not delete a published WordPress log or create a duplicate", async () => {
    const post=query(blog),log=query({ status: "published", wp_post_id: 18489, error_message: null });
    mocks.from.mockReturnValueOnce(post).mockReturnValueOnce(log);
    expect(await run()).toMatchObject({ kind: "fail", reason: "not_safe_to_retry" });
    expect(log.delete).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("blocks ambiguous timeout and draft cases", async () => {
    for (const row of [{ status: "failed", wp_post_id: null, error_message: "timeout 15000ms" }, { status: "skipped", wp_post_id: 18489, error_message: "WordPress draft" }]) {
      mocks.from.mockReturnValueOnce(query(blog)).mockReturnValueOnce(query(row));
      expect(await run()).toMatchObject({ kind: "fail", reason: "not_safe_to_retry" });
    }
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("allows only a 401 failure and never deletes the previous log", async () => {
    const log=query({ status: "failed", wp_post_id: null, error_message: "HTTP 401: rest_cannot_create" });
    mocks.from.mockReturnValueOnce(query(blog)).mockReturnValueOnce(log);
    mocks.publish.mockResolvedValueOnce({ ok: true, wpPostId: 18489, wpPostUrl: "https://info.keeper0301.com/test/" });
    expect(await run()).toMatchObject({ kind: "ok", wpPostId: 18489 });
    expect(log.delete).not.toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
});
