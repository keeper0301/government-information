import type { PublishResult } from "./publisher";
import { shouldAutoReleaseToWordPress } from "./retry-safety";

/** Safe diagnostics only: never return the raw WordPress error body. */
export function summarizeWordPressResult(result: PublishResult) {
  if (result.ok) return { status: "published" as const, url: result.wpPostUrl, wpPostId: result.wpPostId };
  const knownId = "wpPostId" in result ? result.wpPostId ?? null : null;
  return {
    status: result.reason === "held_for_review" ? "held_for_review" as const : "failed" as const,
    reason: result.reason,
    ...(knownId != null ? { wpPostId: knownId } : {}),
    ...("wpPostUrl" in result && result.wpPostUrl ? { url: result.wpPostUrl } : {}),
    ...(result.reason === "api_error" && result.httpStatus != null ? { httpStatus: result.httpStatus } : {}),
    // Informational only. Retry routes still read the durable log and claim atomically.
    retryEligible: result.reason === "api_error" && shouldAutoReleaseToWordPress({
      status: "failed", wp_post_id: knownId, error_message: result.error,
    }, null),
  };
}
