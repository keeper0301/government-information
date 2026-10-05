type WordPressLogState = {
  status: string;
  wp_post_id: number | null;
  error_message: string | null;
};

/** Avoid duplicate posts on quality-check reruns after an ambiguous WP response. */
export function shouldAutoReleaseToWordPress(
  log: WordPressLogState | null,
  lookupError: unknown,
): boolean {
  if (lookupError) return false;
  if (!log) return true; // Quality gate held the initial publish: no WP call yet.
  return log.status === "failed" && log.wp_post_id == null &&
    /^HTTP (401|403):/.test(log.error_message ?? "");
}
