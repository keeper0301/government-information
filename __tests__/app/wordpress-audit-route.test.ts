import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ authorizePrivateCronRequest: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/wordpress/reconcile-preview", () => ({ findWordPressByBacklink: mocks.lookup }));
import { GET } from "@/app/api/cron/wordpress-audit/route";

const id = "892570b0-2458-4e85-8c86-60d97ec8615c";
function query(result: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is", "not", "like", "gte", "lt", "order", "range"]) q[method] = vi.fn().mockReturnValue(q);
  q.then = vi.fn((resolve: (x: unknown) => void) => resolve(result));
  return q;
}
function request(path = "") { return new Request("https://www.keepioo.com/api/cron/wordpress-audit" + path); }

describe("WordPress late audit (read only)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockReturnValue(null); process.env.WP_API_URL = "https://info.keeper0301.com/wp-json/wp/v2"; });
  it("rejects unauthenticated callers without accessing Supabase or WordPress", async () => {
    mocks.authorize.mockReturnValueOnce(new Response(null, { status: 401 }));
    expect((await GET(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("bounds the batch and reports late unique matches without mutating records", async () => {
    const failed = query({ data: [{ blog_post_id: id, error_message: "timeout 15000ms", wp_post_id: null, blog_post: { slug: "test-policy" } }], error: null, count: 1 });
    mocks.from.mockReturnValueOnce(failed).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(query({ count: 0, error: null }));
    mocks.lookup.mockResolvedValueOnce({ kind: "unique_match", matches: [{ id: 18489, url: "https://info.keeper0301.com/post/" }], examined: 1 });
    const response = await GET(request("?limit=1&offset=0"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, candidates: 1, totalRecentTimeouts: 1, uniqueMatches: [{ blogPostId: id, wpPostId: 18489 }], staleClaims: 0 });
    expect(failed.like).toHaveBeenCalledWith("error_message", "timeout %");
    expect(failed.range).toHaveBeenCalledWith(0, 0);
    expect(mocks.lookup).toHaveBeenCalledWith("test-policy", process.env.WP_API_URL);
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
  it("refuses unbounded requests and fails closed on database errors", async () => {
    expect((await GET(request("?limit=21"))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.from.mockReturnValueOnce(query({ data: null, error: { message: "blocked" } })).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(query({ count: 0, error: null }));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("does not claim a search miss is proof the WordPress post never existed", async () => {
    mocks.from.mockReturnValueOnce(query({ data: [{ blog_post_id: id, blog_post: { slug: "test-policy" } }], count: 1, error: null })).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(query({ count: 0, error: null }));
    mocks.lookup.mockResolvedValueOnce({ kind: "not_found_in_search", matches: [], examined: 0 });
    const data = await (await GET(request())).json();
    expect(data).toMatchObject({ ok: true, unresolved: 1, uniqueMatches: [] });
  });
  it("marks an unscanned second page instead of calling a partial scan complete", async () => {
    mocks.from.mockReturnValueOnce(query({ data: [{ blog_post_id: id, blog_post: { slug: "test-policy" } }], count: 7, error: null })).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(query({ count: 0, error: null }));
    mocks.lookup.mockResolvedValueOnce({ kind: "not_found_in_search", matches: [], examined: 0 });
    expect(await (await GET(request())).json()).toMatchObject({ ok: true, hasMore: true, totalRecentTimeouts: 7 });
  });
});
