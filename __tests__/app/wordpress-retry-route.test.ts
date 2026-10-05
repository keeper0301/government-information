import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  from: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@/lib/cron-auth", () => ({ authorizePrivateCronRequest: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/wordpress/publisher", () => ({ publishToWordPress: mocks.publish }));

import { POST } from "@/app/api/cron/wordpress-retry/route";

const id = "892570b0-2458-4e85-8c86-60d97ec8615c";
function request(blogPostId: string) {
  return new Request("https://www.keepioo.com/api/cron/wordpress-retry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blogPostId }),
  });
}
function row(value: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: value, error: null }) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
const post = { id, slug: "test-policy", title: "정책", content: "본문", category: "청년", tags: [], meta_description: null, admin_review_required: false, published_at: "2026-10-05T04:00:00Z" };

describe("WordPress single failed-post retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockReturnValue(null);
    process.env.WP_API_URL = "https://info.keeper0301.com/wp-json/wp/v2";
  });
  it("denies unauthorized requests before touching the DB", async () => {
    mocks.authorize.mockReturnValueOnce(new Response(null, { status: 401 }));
    expect((await POST(request(id))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and already published posts", async () => {
    expect((await POST(request("bad"))).status).toBe(400);
    mocks.from.mockReturnValueOnce(row({ status: "published", wp_post_id: 42 }));
    const response = await POST(request(id));
    expect(response.status).toBe(409);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("requires prior failure and approved published source", async () => {
    mocks.from.mockReturnValueOnce(row({ status: "failed", wp_post_id: null })).mockReturnValueOnce(row({ ...post, admin_review_required: true }));
    expect((await POST(request(id))).status).toBe(409);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("retries only the existing post and reports the target link", async () => {
    mocks.from.mockReturnValueOnce(row({ status: "failed", wp_post_id: null })).mockReturnValueOnce(row(post));
    mocks.publish.mockResolvedValueOnce({ ok: true, wpPostId: 18488, wpPostUrl: "https://info.keeper0301.com/test-policy/" });
    const response = await POST(request(id));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, wpPostId: 18488 });
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledWith(id, expect.objectContaining({ slug: "test-policy" }));
  });
  it("returns WordPress failure without creating another keepioo post", async () => {
    mocks.from.mockReturnValueOnce(row({ status: "failed", wp_post_id: null })).mockReturnValueOnce(row(post));
    mocks.publish.mockResolvedValueOnce({ ok: false, reason: "api_error" });
    const response = await POST(request(id));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, reason: "api_error" });
  });
});
