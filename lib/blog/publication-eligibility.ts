/** Public fields must be checked in full, independently of an LLM score. */
export type BlogPublicFields = {
  title?: string | null;
  content?: string | null;
  meta_description?: string | null;
  tags?: string[] | null;
  faqs?: unknown;
  category?: string | null;
  cover_image?: string | null;
};

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function hasUnfinishedAmount(post: BlogPublicFields): boolean {
  const fields = [post.title, post.content, post.meta_description, post.tags,
    post.faqs, post.category, post.cover_image];
  return strings(fields).some((field) => {
    const text = field.normalize("NFKC")
      .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex, dec) => {
        const code = parseInt(hex || dec, hex ? 16 : 10);
        return code <= 0x10ffff ? String.fromCodePoint(code) : " ";
      })
      .replace(/&nbsp;|&ensp;|&emsp;|&thinsp;/gi, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "");
    const amount = /(?<![a-z0-9])(?:n+|x+|o{2,}|[?？]+)\s*(?:[천백만억조]\s*)*원/iu;
    return amount.test(text) || amount.test(text.replace(/<[^>]*>/g, ""));
  });
}

export type BlogPublicationState = BlogPublicFields & {
  published_at?: string | null;
  admin_review_required?: boolean | null;
  admin_reviewed_at?: string | null;
  admin_review_score?: number | null;
};

export function isBlogPublicationApproved(post: BlogPublicationState): boolean {
  return post.admin_review_required === false && !!post.admin_reviewed_at &&
    !hasUnfinishedAmount(post);
}

export function isBlogPublic(post: BlogPublicationState): boolean {
  return !!post.published_at && isBlogPublicationApproved(post);
}

/** Read-only compatibility for already-public pre-review rows; never a publish grant. */
export function isBlogReadable(post: BlogPublicationState): boolean {
  const fields = ["title", "content", "meta_description", "tags", "faqs", "category", "cover_image"];
  if (!fields.every(field => Object.hasOwn(post, field)) ||
      typeof post.title !== "string" || typeof post.content !== "string") return false;
  const legacy = !!post.published_at && post.admin_review_required === false &&
    post.admin_reviewed_at === null && post.admin_review_score === null;
  return (isBlogPublic(post) || legacy) && !hasUnfinishedAmount(post);
}

/** Candidate state filter. Call isBlogReadable on full public fields before exposure. */
type PublicFilter = {
  eq(column: string, value: boolean): PublicFilter;
  not(column: string, operator: string, value: null): PublicFilter;
};
export function publicBlogQuery<T>(query: T): T {
  // Preserve the selected-row type without recursively instantiating PostgREST's generics.
  return (query as PublicFilter).not("published_at", "is", null)
    .eq("admin_review_required", false) as T;
}
