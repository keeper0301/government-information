// ============================================================
// Instagram normal-post inventory diagnosis — read-only
// ============================================================
// GitHub Actions manual run calls this endpoint with CRON_SECRET.
// It never publishes, never updates DB, and returns aggregate inventory counts
// plus small slug/title samples for operations diagnosis.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { assessExternalPublishQuality } from "@/lib/blog/quality-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_NEW_ACCOUNT_DAILY_CAP = 12;
const DEFAULT_ESTABLISHED_DAILY_CAP = 28;
const ASSESS_LIMIT = 1000;

type BlogPostInventoryRow = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  category: string | null;
  tags: string[] | null;
  instagram_attempt_count: number | null;
  admin_review_required: boolean | null;
  published_at: string | null;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDailyCap(isNewAccount: boolean): number {
  const fallback = isNewAccount ? DEFAULT_NEW_ACCOUNT_DAILY_CAP : DEFAULT_ESTABLISHED_DAILY_CAP;
  const envKey = isNewAccount
    ? "INSTAGRAM_NEW_ACCOUNT_DAILY_CAP"
    : "INSTAGRAM_ESTABLISHED_DAILY_CAP";
  return parsePositiveInt(process.env[envKey] ?? process.env.INSTAGRAM_DAILY_CAP, fallback);
}

function kstMidnightUtc(now = new Date()): Date {
  const midnight = new Date(now);
  midnight.setUTCHours(15, 0, 0, 0);
  if (now.getUTCHours() < 15) midnight.setUTCDate(midnight.getUTCDate() - 1);
  return midnight;
}

function bump(map: Record<string, number>, key: string | null | undefined) {
  const k = key || "미분류";
  map[k] = (map[k] ?? 0) + 1;
}

async function countQuery(label: string, build: (query: any) => Promise<{ count: number | null; error: { message: string } | null }>) {
  const admin = createAdminClient();
  const query = admin.from("blog_posts").select("id", { count: "exact", head: true });
  const { count, error } = await build(query);
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();
  const kstMidnight = kstMidnightUtc(now);
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const [
    eligiblePendingBeforeQuality,
    reviewBlocked,
    exhaustedAttempts,
    failedUnder3,
    publishedToday,
    published24h,
    firstPubRes,
    latestPubRes,
  ] = await Promise.all([
    countQuery("eligiblePending", (q) =>
      q
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .eq("admin_review_required", false)
        .lt("instagram_attempt_count", 3),
    ),
    countQuery("reviewBlocked", (q) =>
      q
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .or("admin_review_required.is.null,admin_review_required.eq.true"),
    ),
    countQuery("exhaustedAttempts", (q) =>
      q
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .gte("instagram_attempt_count", 3),
    ),
    countQuery("failedUnder3", (q) =>
      q.not("instagram_error", "is", null).lt("instagram_attempt_count", 3),
    ),
    countQuery("publishedToday", (q) => q.gte("instagram_published_at", kstMidnight.toISOString())),
    countQuery("published24h", (q) => q.gte("instagram_published_at", since24h)),
    admin
      .from("blog_posts")
      .select("instagram_published_at")
      .not("instagram_published_at", "is", null)
      .order("instagram_published_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("blog_posts")
      .select("slug, instagram_published_at, instagram_media_id")
      .not("instagram_published_at", "is", null)
      .order("instagram_published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: rows, error: rowsError } = await admin
    .from("blog_posts")
    .select(
      "id, slug, title, content, meta_description, category, tags, instagram_attempt_count, admin_review_required, published_at",
    )
    .not("published_at", "is", null)
    .is("instagram_published_at", null)
    .eq("admin_review_required", false)
    .lt("instagram_attempt_count", 3)
    .order("published_at", { ascending: true })
    .limit(ASSESS_LIMIT);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const readySamples: Array<Record<string, unknown>> = [];
  const rejectedSamples: Array<Record<string, unknown>> = [];
  const reasonCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  let readyAfterQualityGate = 0;

  for (const row of (rows ?? []) as BlogPostInventoryRow[]) {
    bump(categoryCounts, row.category);
    const assessment = assessExternalPublishQuality(row);
    if (assessment.approved) {
      readyAfterQualityGate += 1;
      if (readySamples.length < 10) {
        readySamples.push({
          slug: row.slug,
          title: row.title,
          category: row.category,
          attempt_count: row.instagram_attempt_count ?? 0,
        });
      }
    } else {
      for (const reason of assessment.reasons) bump(reasonCounts, reason);
      if (rejectedSamples.length < 10) {
        rejectedSamples.push({
          slug: row.slug,
          title: row.title,
          category: row.category,
          attempt_count: row.instagram_attempt_count ?? 0,
          reasons: assessment.reasons,
          metrics: assessment.metrics,
        });
      }
    }
  }

  const firstPub = firstPubRes.data as { instagram_published_at?: string } | null;
  const isNewAccount =
    !firstPub?.instagram_published_at ||
    Date.now() - new Date(firstPub.instagram_published_at).getTime() < 7 * 86_400_000;
  const dailyCap = resolveDailyCap(isNewAccount);

  return NextResponse.json({
    collectedAt: new Date().toISOString(),
    kstHour: (new Date().getUTCHours() + 9) % 24,
    kstMidnight: kstMidnight.toISOString(),
    account: {
      isNewAccount,
      dailyCap,
      publishedToday,
      remainingCap: Math.max(0, dailyCap - publishedToday),
      published24h,
    },
    inventory: {
      eligiblePendingBeforeQuality,
      assessedCandidateCount: rows?.length ?? 0,
      readyAfterQualityGate,
      rejectedAmongAssessed: (rows?.length ?? 0) - readyAfterQualityGate,
      reviewBlocked,
      exhaustedAttempts,
      failedUnder3,
    },
    reasonCounts,
    categoryCounts,
    readySamples,
    rejectedSamples,
    latestPublished: latestPubRes.data ?? null,
    warnings:
      eligiblePendingBeforeQuality > (rows?.length ?? 0)
        ? [`Only assessed first ${rows?.length ?? 0} of ${eligiblePendingBeforeQuality} eligible rows`]
        : [],
  });
}
