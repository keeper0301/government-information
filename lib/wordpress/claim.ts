import { createAdminClient } from "@/lib/supabase/admin";
import { shouldAutoReleaseToWordPress } from "./retry-safety";

/** Atomically reserve one blog post before making a non-idempotent WP POST. */
export async function claimWordPressPublish(blogPostId: string): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("wordpress_publish_log")
    .insert({ blog_post_id: blogPostId, status: "pending", updated_at: now })
    .select("id")
    .maybeSingle();
  if (!insertError && inserted) return true;
  // Only a unique conflict is an existing attempt; all other DB errors fail closed.
  if (insertError?.code !== "23505") return false;

  const { data: previous, error: lookupError } = await admin
    .from("wordpress_publish_log")
    .select("status, wp_post_id, error_message")
    .eq("blog_post_id", blogPostId)
    .maybeSingle();
  if (!previous || !shouldAutoReleaseToWordPress(previous, lookupError)) return false;

  // A failed 401/403 could not have created the WP post. Compare-and-swap means
  // two quality-check runs cannot both move it back to pending.
  const { data: claimed, error: claimError } = await admin
    .from("wordpress_publish_log")
    .update({ status: "pending", updated_at: now })
    .eq("blog_post_id", blogPostId)
    .eq("status", "failed")
    .is("wp_post_id", null)
    .eq("error_message", previous.error_message)
    .select("id");
  return !claimError && Array.isArray(claimed) && claimed.length === 1;
}
