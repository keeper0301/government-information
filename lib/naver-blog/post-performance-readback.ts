import { createAdminClient } from "@/lib/supabase/admin";
import { convertToNaverBlogHtml, type BlogPostForNaver } from "./format";
import { createNaverContentFingerprint } from "./content-identity";

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CONVERSION_EVENTS = new Set(["signup_completed", "checkout_completed", "subscription_active"]);
const CTA_EVENTS = new Set(["cta_clicked", "upgrade_cta_clicked", "quiz_signup_clicked", "pricing_plan_selected"]);

export type ReadbackState = "signal" | "no_signal" | "awaiting_publish" | "unavailable";
export type PerformanceWindow = {
  state: ReadbackState;
  sessions: number;
  activeUsers: null;
  ctaClicks: number;
  conversionSignals: number;
  observedThrough: string | null;
  error?: string;
};

export type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

const FINGERPRINT_RE = /^[0-9a-f]{16}$/i;

export function resolveNaverPerformanceIdentity(input: {
  suppliedFingerprint: string;
  currentFingerprint: string;
  successfulPublishCount: number;
  publishedFingerprint: string | null;
}) {
  if (input.successfulPublishCount > 1) {
    return { ok: false, reason: "duplicate_success_audit" as const, historicalFormatterDrift: false };
  }
  if (input.successfulPublishCount === 1) {
    if (!input.publishedFingerprint) {
      return { ok: false, reason: "published_fingerprint_not_pinned" as const, historicalFormatterDrift: false };
    }
    if (input.suppliedFingerprint !== input.publishedFingerprint) {
      return { ok: false, reason: "supplied_fingerprint_not_published" as const, historicalFormatterDrift: false };
    }
    return {
      ok: true,
      reason: null,
      historicalFormatterDrift: input.currentFingerprint !== input.publishedFingerprint,
    };
  }
  return input.suppliedFingerprint === input.currentFingerprint
    ? { ok: true, reason: null, historicalFormatterDrift: false }
    : { ok: false, reason: "content_changed_before_publish" as const, historicalFormatterDrift: false };
}

function auditFingerprint(row: { content_fingerprint?: unknown; details?: unknown } | undefined): string | null {
  if (!row) return null;
  if (typeof row.content_fingerprint === "string" && FINGERPRINT_RE.test(row.content_fingerprint)) return row.content_fingerprint;
  const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : null;
  const fallback = details?.contentFingerprint;
  return typeof fallback === "string" && FINGERPRINT_RE.test(fallback) ? fallback : null;
}

export function summarizeGa4Rows(
  rows: Ga4Row[],
  publishedAt: string,
  hours: 24 | 168,
): PerformanceWindow {
  const start = new Date(publishedAt).getTime();
  const end = Math.min(Date.now(), start + hours * 3_600_000);
  let sessions = 0;
  let ctaClicks = 0;
  let conversionSignals = 0;
  let observedThrough: string | null = null;

  for (const row of rows) {
    const eventName = row.dimensionValues?.[0]?.value ?? "";
    const dateHourMinute = row.dimensionValues?.[1]?.value ?? "";
    if (!/^\d{12}$/.test(dateHourMinute)) continue;
    const timestamp = Date.parse(
      `${dateHourMinute.slice(0, 4)}-${dateHourMinute.slice(4, 6)}-${dateHourMinute.slice(6, 8)}T${dateHourMinute.slice(8, 10)}:${dateHourMinute.slice(10, 12)}:00+09:00`,
    );
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) continue;
    const iso = new Date(timestamp).toISOString();
    if (!observedThrough || iso > observedThrough) observedThrough = iso;
    // GA repeats session metrics for each eventName row. Count only session_start.
    if (eventName === "session_start") {
      sessions += Number(row.metricValues?.[0]?.value ?? 0) || 0;
    }
    const eventCount = Number(row.metricValues?.[1]?.value ?? 0) || 0;
    if (CTA_EVENTS.has(eventName)) ctaClicks += eventCount;
    if (CONVERSION_EVENTS.has(eventName)) conversionSignals += eventCount;
  }

  const hasSignal = sessions > 0 || ctaClicks > 0 || conversionSignals > 0;
  return {
    state: hasSignal ? "signal" : "no_signal",
    sessions,
    activeUsers: null,
    ctaClicks,
    conversionSignals,
    observedThrough,
  };
}

async function getGa4Token(): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GA4_CLIENT_ID!,
      client_secret: process.env.GA4_CLIENT_SECRET!,
      refresh_token: process.env.GA4_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ga4_token_${response.status}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("ga4_token_missing");
  return json.access_token;
}

async function readGa4Rows(input: { contentId: string; queueId: string; publishedAt: string }): Promise<Ga4Row[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId || !process.env.GA4_CLIENT_ID || !process.env.GA4_CLIENT_SECRET || !process.env.GA4_REFRESH_TOKEN) {
    throw new Error("ga4_credentials_missing");
  }
  const token = await getGa4Token();
  const start = new Date(input.publishedAt);
  const end = new Date(Math.min(Date.now(), start.getTime() + 7 * 86_400_000));
  const date = (value: Date) => value.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const response = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: date(start), endDate: date(end) }],
      dimensions: [{ name: "eventName" }, { name: "dateHourMinute" }],
      metrics: [{ name: "sessions" }, { name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "sessionSource",
                stringFilter: { matchType: "EXACT", value: "naver_blog", caseSensitive: true },
              },
            },
            {
              filter: {
                fieldName: "sessionCampaignName",
                stringFilter: { matchType: "EXACT", value: "naver_blog", caseSensitive: true },
              },
            },
            {
              filter: {
                fieldName: "sessionManualAdContent",
                stringFilter: { matchType: "EXACT", value: input.contentId, caseSensitive: true },
              },
            },
            {
              filter: {
                fieldName: "sessionCampaignId",
                stringFilter: { matchType: "EXACT", value: input.queueId, caseSensitive: true },
              },
            },
          ],
        },
      },
      limit: "10000",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ga4_report_${response.status}`);
  return ((await response.json()) as { rows?: Ga4Row[] }).rows ?? [];
}

type QueueRow = {
  id: string;
  blog_post_id: string;
  status: "pending" | "published" | "skipped";
  published_at: string | null;
  naver_url: string | null;
  skip_reason: string | null;
  blog_post: BlogPostForNaver & { slug: string } | Array<BlogPostForNaver & { slug: string }>;
};

const awaitingWindow = (): PerformanceWindow => ({
  state: "awaiting_publish",
  sessions: 0,
  activeUsers: null,
  ctaClicks: 0,
  conversionSignals: 0,
  observedThrough: null,
});

export async function getNaverPostPerformanceReadback(input: {
  contentId: string;
  queueId: string;
  fingerprint: string;
}) {
  const checkedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_blog_queue")
    .select("id, blog_post_id, status, published_at, naver_url, skip_reason, blog_post:blog_posts!inner(slug, title, content, meta_description, category, cover_image)")
    .eq("id", input.queueId)
    .maybeSingle();
  if (error) throw new Error(`readback_queue_query_failed:${error.message}`);
  if (!data) throw new Error("readback_queue_not_found");
  const row = data as unknown as QueueRow;
  if (row.blog_post_id !== input.contentId) throw new Error("content_queue_mismatch");
  const post = Array.isArray(row.blog_post) ? row.blog_post[0] : row.blog_post;
  if (!post) throw new Error("readback_content_not_found");
  const payload = convertToNaverBlogHtml(post, { contentId: row.blog_post_id, queueId: row.id });
  const currentFingerprint = createNaverContentFingerprint({
    queueId: row.id,
    contentId: row.blog_post_id,
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    backlinkUrl: payload.backlinkUrl,
    coverImageUrl: payload.coverImageUrl,
  });
  const { data: auditRows, error: auditError } = await admin
    .from("naver_publish_audit")
    .select("attempted_at, naver_url, content_fingerprint, details")
    .eq("post_id", input.contentId)
    .eq("result", "success")
    .order("attempted_at", { ascending: true });
  if (auditError) throw new Error(`readback_audit_query_failed:${auditError.message}`);
  const successes = auditRows ?? [];
  const duplicateSuccessCount = Math.max(0, successes.length - 1);
  const publishedFingerprint = auditFingerprint(successes[0]);
  const identity = resolveNaverPerformanceIdentity({
    suppliedFingerprint: input.fingerprint,
    currentFingerprint,
    successfulPublishCount: successes.length,
    publishedFingerprint,
  });
  const publishedAt = row.published_at ?? successes[0]?.attempted_at ?? null;
  const published = row.status === "published" || successes.length > 0;

  if (!identity.ok) {
    return {
      checkedAt,
      status: "rollback_required" as const,
      approval: {
        state: "fingerprint_mismatch",
        suppliedFingerprint: input.fingerprint,
        currentFingerprint,
        publishedFingerprint,
      },
      publication: { state: published ? "published" : "awaiting_publish", publishedAt, naverUrl: row.naver_url ?? successes[0]?.naver_url ?? null },
      dedupe: { safe: duplicateSuccessCount === 0, successfulPublishCount: successes.length, duplicateSuccessCount },
      rollback: { required: true, reason: identity.reason },
      windows: { h24: awaitingWindow(), d7: awaitingWindow() },
    };
  }

  if (!published || !publishedAt) {
    return {
      checkedAt,
      status: "awaiting_publish" as const,
      approval: {
        state: identity.historicalFormatterDrift ? "published_identity_pinned" as const : "exact_identity_matched" as const,
        suppliedFingerprint: input.fingerprint,
        currentFingerprint,
        publishedFingerprint,
        historicalFormatterDrift: identity.historicalFormatterDrift,
      },
      publication: { state: "awaiting_publish", publishedAt: null, naverUrl: null, queueStatus: row.status, skipReason: row.skip_reason },
      dedupe: { safe: true, successfulPublishCount: 0, duplicateSuccessCount: 0 },
      rollback: { required: false, reason: null },
      windows: { h24: awaitingWindow(), d7: awaitingWindow() },
    };
  }

  let h24: PerformanceWindow;
  let d7: PerformanceWindow;
  try {
    const rows = await readGa4Rows({ contentId: input.contentId, queueId: input.queueId, publishedAt });
    h24 = summarizeGa4Rows(rows, publishedAt, 24);
    d7 = summarizeGa4Rows(rows, publishedAt, 168);
  } catch (cause) {
    const errorMessage = cause instanceof Error ? cause.message : "ga4_unknown_error";
    const unavailable: PerformanceWindow = { state: "unavailable", sessions: 0, activeUsers: null, ctaClicks: 0, conversionSignals: 0, observedThrough: null, error: errorMessage };
    h24 = unavailable;
    d7 = { ...unavailable };
  }

  return {
    checkedAt,
    status: duplicateSuccessCount > 0 ? "rollback_required" as const : "readback_ready" as const,
    approval: {
      state: identity.historicalFormatterDrift ? "published_identity_pinned" as const : "exact_identity_matched" as const,
      suppliedFingerprint: input.fingerprint,
      currentFingerprint,
      publishedFingerprint,
      historicalFormatterDrift: identity.historicalFormatterDrift,
    },
    publication: { state: "published", publishedAt, naverUrl: row.naver_url ?? successes[0]?.naver_url ?? null },
    dedupe: { safe: duplicateSuccessCount === 0, successfulPublishCount: successes.length, duplicateSuccessCount },
    rollback: { required: duplicateSuccessCount > 0, reason: duplicateSuccessCount > 0 ? "duplicate_success_audit" : null },
    warning: identity.historicalFormatterDrift ? "historical_formatter_drift" as const : null,
    windows: { h24, d7 },
  };
}
