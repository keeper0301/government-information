import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ calls: [] as Array<Array<unknown>>, index: 0 }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirected"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "admin@example.com" } } }) } }) }));
vi.mock("@/lib/admin-auth", () => ({ isAdminUser: () => true }));
vi.mock("@/components/admin/admin-page-header", () => ({ AdminPageHeader: () => null }));
vi.mock("@/app/admin/wordpress/republish-button", () => ({ RepublishButton: () => null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => {
    const index = mocks.index++;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lt", "not", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => { (mocks.calls[index] ??= []).push([method, ...args]); return chain; };
    }
    chain.then = (resolve: (result: unknown) => void) => resolve(index === 5
      ? { count: 2, data: null }
      : index === 9
        ? { count: null, data: [{ id: "stuck", updated_at: "2026-10-05T10:00:00Z", blog_post: { slug: "example", title: "멈춘 글" } }] }
        : { count: 0, data: [] });
    return chain;
  } }),
}));

import AdminWordPressPage from "@/app/admin/wordpress/page";

describe("WordPress admin stale claim visibility", () => {
  beforeEach(() => { mocks.calls = []; mocks.index = 0; });
  it("counts pending claims older than 15 minutes and warns without retrying", async () => {
    const html = renderToStaticMarkup(await AdminWordPressPage());
    expect(html).toContain("15분+ 선점 지연");
    expect(html).toContain("멈춘 글");
    expect(html).toContain("자동 재발행하지 않습니다");
    expect(mocks.calls[5]).toEqual(expect.arrayContaining([["eq", "status", "pending"], expect.arrayContaining(["lt", "updated_at"])]));
    expect(mocks.calls[9]).toEqual(expect.arrayContaining([["eq", "status", "pending"], expect.arrayContaining(["lt", "updated_at"])]));
  });
});
