import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { claimWordPressPublish } from "@/lib/wordpress/claim";

const id = "892570b0-2458-4e85-8c86-60d97ec8615c";
function query(single: unknown, error: unknown = null) {
  const q = {
    insert: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: single, error }),
  };
  q.insert.mockReturnValue(q);q.update.mockReturnValue(q);q.eq.mockReturnValue(q);q.is.mockReturnValue(q);
  q.select.mockReturnValue(q);
  // update(...).eq(...).select(...) can override this with a list response.
  return { q };
}

describe("WordPress atomic publish claim", () => {
  beforeEach(() => vi.clearAllMocks());
  it("creates a pending claim for the first call", async () => {
    const first=query({ id: "claim" });mocks.from.mockReturnValueOnce(first.q);
    expect(await claimWordPressPublish(id)).toBe(true);
    expect(first.q.insert).toHaveBeenCalledWith(expect.objectContaining({ blog_post_id: id, status: "pending" }));
  });
  it("fails closed on DB errors other than the unique collision", async () => {
    mocks.from.mockReturnValueOnce(query(null, { code: "42501" }).q);
    expect(await claimWordPressPublish(id)).toBe(false);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("refuses an existing draft, timeout, or known WP ID", async () => {
    for (const existing of [
      { status: "skipped", wp_post_id: 18489, error_message: "draft" },
      { status: "failed", wp_post_id: null, error_message: "timeout 15000ms" },
      { status: "failed", wp_post_id: 18489, error_message: "HTTP 401: rest_cannot_create" },
    ]) {
      mocks.from.mockReturnValueOnce(query(null, { code: "23505" }).q).mockReturnValueOnce(query(existing).q);
      expect(await claimWordPressPublish(id)).toBe(false);
    }
  });
  it("compare-and-swaps a prior 401 once, rejecting the losing concurrent claim", async () => {
    const previous={ status: "failed", wp_post_id: null, error_message: "HTTP 401: rest_cannot_create" };
    const updated=query(null);updated.q.select.mockResolvedValueOnce({ data: [{ id: "claim" }], error: null });
    mocks.from.mockReturnValueOnce(query(null, { code: "23505" }).q)
      .mockReturnValueOnce(query(previous).q).mockReturnValueOnce(updated.q);
    expect(await claimWordPressPublish(id)).toBe(true);
    expect(updated.q.eq).toHaveBeenCalledWith("error_message", previous.error_message);
    const losing=query(null);losing.q.select.mockResolvedValueOnce({ data: [], error: null });
    mocks.from.mockReturnValueOnce(query(null, { code: "23505" }).q)
      .mockReturnValueOnce(query(previous).q).mockReturnValueOnce(losing.q);
    expect(await claimWordPressPublish(id)).toBe(false);
  });
});
