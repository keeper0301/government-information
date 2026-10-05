import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payloadStatus: "publish" as "publish" | "draft",
  upsert: vi.fn(),
  fetch: vi.fn(),
  claim: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
vi.mock("@/lib/wordpress/format", () => ({
  convertToWordPress: () => ({
    title: "정책 테스트", status: mocks.payloadStatus, content: "본문", excerpt: "요약", categories: [], tags: [],
  }),
}));
vi.mock("@/lib/wordpress/terms", () => ({
  fetchOrCreateCategoryIds: vi.fn().mockResolvedValue([]),
  fetchOrCreateTagIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/wordpress/claim", () => ({ claimWordPressPublish: mocks.claim }));
vi.mock("@/lib/wordpress/reconcile-preview", () => ({ findWordPressByBacklink: mocks.lookup }));

import { publishToWordPress } from "@/lib/wordpress/publisher";

const post = {
  slug: "test-policy", title: "정책 테스트", content: "본문", meta_description: null,
  tags: [], category: "청년",
};
const blogId = "892570b0-2458-4e85-8c86-60d97ec8615c";
const wpLink = "https://info.keeper0301.com/test-policy/";
const originalEnv = {
  api: process.env.WP_API_URL,
  user: process.env.WP_USERNAME,
  password: process.env.WP_APP_PASSWORD,
};
function wpReply(status: string, link = wpLink, id: unknown = 18489) {
  mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id, link, status }) });
}
function lastLog(): Record<string, unknown> {
  return mocks.upsert.mock.lastCall?.[0] ?? {};
}

describe("WordPress publish truth contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.payloadStatus = "publish";
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.claim.mockResolvedValue(true);
    mocks.lookup.mockResolvedValue({ kind: "not_found_in_search", matches: [], examined: 0 });
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.WP_API_URL = "https://info.keeper0301.com/wp-json/wp/v2";
    process.env.WP_USERNAME = "test-user";
    process.env.WP_APP_PASSWORD = "fixture-only";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [k, v] of Object.entries({ WP_API_URL: originalEnv.api, WP_USERNAME: originalEnv.user, WP_APP_PASSWORD: originalEnv.password })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("publishes only when WordPress confirms publish and the expected host", async () => {
    wpReply("publish");
    expect(await publishToWordPress(blogId, post)).toEqual({ ok: true, wpPostId: 18489, wpPostUrl: wpLink });
    expect(lastLog()).toMatchObject({ status: "published", wp_post_id: 18489, wp_post_url: wpLink, error_message: null });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://info.keeper0301.com/wp-json/wp/v2/posts");
  });
  it("keeps a humanize-gated draft in the review queue, never in published counts", async () => {
    mocks.payloadStatus = "draft";
    wpReply("draft");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "held_for_review", wpPostId: 18489 });
    expect(lastLog()).toMatchObject({ status: "skipped", wp_post_id: 18489, published_at: null, error_message: expect.stringContaining("draft") });
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).status).toBe("draft");
  });
  it("holds a draft even when publish was requested", async () => {
    wpReply("draft");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "held_for_review" });
    expect(lastLog().status).toBe("skipped");
  });
  it("rejects a wrong-host link but preserves the created ID to block blind retry", async () => {
    wpReply("publish", "https://keeper0301.com/test-policy/");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "api_error" });
    expect(lastLog()).toMatchObject({ status: "failed", wp_post_id: 18489 });
  });
  it("rejects missing status but preserves the created ID", async () => {
    wpReply("");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "api_error" });
    expect(lastLog()).toMatchObject({ status: "failed", wp_post_id: 18489 });
  });
  it("does not call a post published when the DB log write failed", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { message: "fixture db unavailable" } });
    wpReply("publish");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "log_error", wpPostId: 18489 });
  });
  it("does not claim a held draft entered the review queue when logging failed", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { message: "fixture db unavailable" } });
    wpReply("draft");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "log_error", wpPostId: 18489 });
  });
  it("reports a WordPress publish response that violated a requested draft", async () => {
    mocks.payloadStatus = "draft";
    wpReply("publish");
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "api_error" });
    expect(lastLog()).toMatchObject({ status: "failed", wp_post_id: 18489 });
  });
  it("rejects malformed WP URLs before sending an application password", async () => {
    process.env.WP_API_URL = "http://info.keeper0301.com/wp-json/wp/v2";
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "skipped_invalid_url" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("never POSTs when the DB claim is taken by another worker", async () => {
    mocks.claim.mockResolvedValueOnce(false);
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "claim_unavailable_or_duplicate" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("recovers a timed-out POST only from one exact public backlink match", async () => {
    mocks.fetch.mockRejectedValueOnce(Object.assign(new Error("slow"), { name: "AbortError" }));
    mocks.lookup.mockResolvedValueOnce({ kind: "unique_match", matches: [{ id: 18489, url: wpLink }], examined: 1 });
    expect(await publishToWordPress(blogId, post)).toEqual({ ok: true, wpPostId: 18489, wpPostUrl: wpLink });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.lookup).toHaveBeenCalledWith(post.slug, process.env.WP_API_URL, mocks.fetch, expect.objectContaining({ notBeforeMs: expect.any(Number) }));
    expect(lastLog()).toMatchObject({ status: "published", wp_post_id: 18489 });
  });
  it("leaves an uncertain timeout failed without a second POST", async () => {
    mocks.fetch.mockRejectedValueOnce(Object.assign(new Error("slow"), { name: "AbortError" }));
    expect(await publishToWordPress(blogId, post)).toMatchObject({ ok: false, reason: "timeout" });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(lastLog()).toMatchObject({ status: "failed", error_message: expect.stringContaining("public_lookup=not_found_in_search") });
  });
});
