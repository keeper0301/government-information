// Read-only, bounded WordPress lookup after an ambiguous POST timeout.
// A search miss is NEVER proof the post does not exist; do not POST again.
export type WordPressReconcilePreview = {
  kind: "unique_match" | "ambiguous" | "not_found_in_search" | "inconclusive" | "unavailable";
  matches: Array<{ id: number; url: string }>;
  examined: number;
};

const noEvidence = (kind: WordPressReconcilePreview["kind"]): WordPressReconcilePreview => ({
  kind, matches: [], examined: 0,
});

function hasExactBacklink(rendered: unknown, slug: string): boolean {
  if (typeof rendered !== "string") return false;
  const expectedPath = `/blog/${slug}`;
  const anchors = rendered.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi);
  for (const anchor of anchors) {
    try {
      const url = new URL(anchor[2].replace(/&amp;|&#0*38;|&#x0*26;/gi, "&"));
      const path = decodeURIComponent(url.pathname);
      if (url.protocol === "https:" && url.hostname === "www.keepioo.com" &&
          path === expectedPath && !url.search && !url.hash) return true;
    } catch { /* Ignore malformed links in untrusted WP content. */ }
  }
  return false;
}

export async function findWordPressByBacklink(
  slug: string,
  wpApiUrl: string,
  fetcher: typeof fetch = fetch,
  options: { notBeforeMs?: number } = {},
): Promise<WordPressReconcilePreview> {
  if (!slug || slug.length > 240 || /[/?#]/.test(slug)) return noEvidence("unavailable");
  let api: URL;
  try {
    api = new URL(wpApiUrl);
    if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash ||
        api.pathname.replace(/\/$/, "") !== "/wp-json/wp/v2") return noEvidence("unavailable");
  } catch { return noEvidence("unavailable"); }

  const searchUrl = new URL(`${api.origin}/wp-json/wp/v2/posts`);
  searchUrl.searchParams.set("search", slug);
  searchUrl.searchParams.set("per_page", "100");
  searchUrl.searchParams.set("_fields", "id,status,link,content,date_gmt");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(searchUrl.toString(), {
        method: "GET", cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("wp_read_unavailable");
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) return noEvidence("unavailable");
      const total = Number(response.headers.get("X-WP-Total"));
      const matches = rows.flatMap((row: unknown) => {
        if (!row || typeof row !== "object") return [];
        const post = row as Record<string, unknown>;
        const content = post.content;
        const rendered = content && typeof content === "object" ? (content as Record<string, unknown>).rendered : null;
        const id = post.id;
        const link = post.link;
        if (options.notBeforeMs !== undefined) {
          // WordPress date_gmt has no suffix. Parse explicitly as UTC; a missing
          // timestamp is not enough evidence to resolve an in-flight POST.
          const date = typeof post.date_gmt === "string" ? Date.parse(`${post.date_gmt}Z`) : NaN;
          if (!Number.isFinite(date) || date < options.notBeforeMs - 120_000 || date > Date.now() + 60_000) return [];
        }
        if (post.status !== "publish" || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
            typeof link !== "string" || !hasExactBacklink(rendered, slug)) return [];
        try {
          const parsed = new URL(link);
          if (parsed.protocol !== "https:" || parsed.origin !== api.origin) return [];
        } catch { return []; }
        return [{ id, url: link }];
      });
      // A missing/stripped total header does not prove the first 100 are exhaustive.
      if (rows.length >= 100 || (Number.isFinite(total) && total > 100)) {
        return { kind: "inconclusive", matches, examined: rows.length };
      }
      return {
        kind: matches.length === 1 ? "unique_match" : matches.length > 1 ? "ambiguous" : "not_found_in_search",
        matches, examined: rows.length,
      };
    } catch { /* Only repeat the read; never repeat the WP POST. */ }
  }
  return noEvidence("unavailable");
}
