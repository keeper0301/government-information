import { describe, expect, it, vi } from "vitest";
import { findWordPressByBacklink } from "@/lib/wordpress/reconcile-preview";

const api = "https://info.keeper0301.com/wp-json/wp/v2";
const slug = "sample-policy-123";
const backlink = `https://www.keepioo.com/blog/${slug}`;
const candidate = (id: number, href = backlink, status = "publish") => ({
  id, status, link: `https://info.keeper0301.com/post-${id}/`,
  date_gmt: new Date().toISOString().replace(/Z$/, ""),
  content: { rendered: `<p><a rel="canonical" href="${href}">원본</a></p>` },
});
function reply(rows: unknown[], total = rows.length) {
  return { ok: true, headers: { get: () => String(total) }, json: async () => rows } as unknown as Response;
}

describe("WordPress timeout reconciliation preview", () => {
  it("confirms exactly one published post by exact canonical backlink", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply([candidate(41), candidate(42, "https://www.keepioo.com/blog/another")]));
    expect(await findWordPressByBacklink(slug, api, fetcher)).toEqual({ kind: "unique_match", matches: [{ id: 41, url: "https://info.keeper0301.com/post-41/" }], examined: 2 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toContain(`search=${slug}`);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
  });
  it("does not treat a title hit, wrong link host, draft, or lookalike slug as proof", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply([
      candidate(41, "https://www.keepioo.com/blog/sample-policy-123-extra"),
      candidate(42, "https://evil.example/blog/sample-policy-123"),
      candidate(43, backlink, "draft"),
      { ...candidate(44), link: "https://evil.example/post/" },
    ]));
    expect(await findWordPressByBacklink(slug, api, fetcher)).toMatchObject({ kind: "not_found_in_search", matches: [] });
  });
  it("identifies duplicates rather than auto-resolving either", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply([candidate(41), candidate(42)]));
    expect(await findWordPressByBacklink(slug, api, fetcher)).toMatchObject({ kind: "ambiguous", matches: [{ id: 41 }, { id: 42 }] });
  });
  it("does not attribute an older post to an in-flight timeout", async () => {
    const old = { ...candidate(41), date_gmt: "2020-01-01T00:00:00" };
    const fetcher = vi.fn().mockResolvedValue(reply([old]));
    expect(await findWordPressByBacklink(slug, api, fetcher, { notBeforeMs: Date.now() })).toMatchObject({ kind: "not_found_in_search", matches: [] });
  });
  it("never concludes absence on truncated search or network failure", async () => {
    const truncated = vi.fn().mockResolvedValue(reply([], 101));
    expect(await findWordPressByBacklink(slug, api, truncated)).toMatchObject({ kind: "inconclusive" });
    const headerMissing = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null }, json: async () => Array.from({ length: 100 }, () => candidate(41)) });
    expect(await findWordPressByBacklink(slug, api, headerMissing)).toMatchObject({ kind: "inconclusive" });
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await findWordPressByBacklink(slug, api, offline)).toMatchObject({ kind: "unavailable" });
    expect(offline).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed WP origin before external lookup", async () => {
    const fetcher = vi.fn();
    expect(await findWordPressByBacklink(slug, "http://info.keeper0301.com/wp-json/wp/v2", fetcher)).toMatchObject({ kind: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
