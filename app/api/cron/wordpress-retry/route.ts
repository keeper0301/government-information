import { NextResponse } from "next/server";
import { authorizePrivateCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishToWordPress } from "@/lib/wordpress/publisher";
import { shouldAutoReleaseToWordPress } from "@/lib/wordpress/retry-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry one already-failed, approved blog post without generating another article. */
export async function POST(request: Request) {
  const denied = authorizePrivateCronRequest(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const blogPostId = body?.blogPostId;
  if (typeof blogPostId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(blogPostId)) {
    return NextResponse.json({ ok: false, reason: "invalid_blog_post_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: log, error: logError } = await admin
    .from("wordpress_publish_log")
    .select("status, wp_post_id, error_message")
    .eq("blog_post_id", blogPostId)
    .maybeSingle();
  if (logError) return NextResponse.json({ ok: false, reason: "log_lookup_failed" }, { status: 500 });
  if (!log || !shouldAutoReleaseToWordPress(log, null)) {
    return NextResponse.json({ ok: false, reason: "not_a_failed_unpublished_post" }, { status: 409 });
  }

  const { data: post, error: postError } = await admin
    .from("blog_posts")
    .select("id, slug, title, content, meta_description, tags, category, admin_review_required, published_at")
    .eq("id", blogPostId)
    .maybeSingle();
  if (postError) return NextResponse.json({ ok: false, reason: "post_lookup_failed" }, { status: 500 });
  if (!post || post.admin_review_required !== false || !post.published_at) {
    return NextResponse.json({ ok: false, reason: "post_not_approved" }, { status: 409 });
  }

  try {
    const result = await publishToWordPress(blogPostId, {
      slug: post.slug,
      title: post.title,
      content: post.content,
      meta_description: post.meta_description,
      tags: post.tags,
      category: post.category,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: result.reason === "held_for_review" || result.reason === "claim_unavailable_or_duplicate" ? 409 : 502 },
      );
    }
    const targetHost = new URL(process.env.WP_API_URL!).hostname;
    if (new URL(result.wpPostUrl).hostname !== targetHost) {
      return NextResponse.json({ ok: false, reason: "unexpected_wordpress_host" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, wpPostId: result.wpPostId, wpPostUrl: result.wpPostUrl });
  } catch {
    return NextResponse.json({ ok: false, reason: "unexpected_retry_error" }, { status: 500 });
  }
}
