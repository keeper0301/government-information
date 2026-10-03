export type ContentStatus = "draft" | "source-checked" | "owner-reviewed" | "published" | "refresh-needed" | "closed" | "merged";
export interface ContentQuality {
  status: ContentStatus;
  sourcesVerified: boolean;
  originalValue: boolean;
  ownerReviewed: boolean;
  nonempty: boolean;
  indexEligible: boolean;
}
const PRIVATE_OR_UTILITY = /^\/(admin|api|auth|login|signup|logout|checkout|payment|pricing|refund|mypage|profile|onboarding|search|compare|recommend|consult|alerts|thank-you|error)(\/|$)/;
export function isPublicContentPath(pathname: string): boolean {
  if (PRIVATE_OR_UTILITY.test(pathname)) return false;
  return pathname === "/" || /^\/(guides|c|welfare|loan|blog|news)(\/|$)/.test(pathname);
}
/** Existing indexing is preserved independently; account approval alone is never content approval. */
export function contentEligibility(pathname: string, quality: ContentQuality | undefined, options: { reviewMode: boolean; httpStatus?: number; filtered?: boolean; databaseFailed?: boolean }) {
  const accessible = (options.httpStatus ?? 200) === 200 && !options.databaseFailed;
  return {
    indexEligible: accessible && !!quality?.indexEligible,
    adEligible: !options.reviewMode && accessible && !options.filtered && isPublicContentPath(pathname)
      && !!quality?.nonempty && quality.sourcesVerified && quality.originalValue && quality.ownerReviewed
      && ["owner-reviewed", "published"].includes(quality.status),
  };
}
