import { createAdminClient } from "@/lib/supabase/admin";
import { createNaverContentFingerprint } from "./content-identity";
import { convertToNaverBlogHtml, type BlogPostForNaver } from "./format";
import { fetchAndVerifyNaverPublicPost, parseNaverPublicIdentity } from "./public-readback";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_RE = /^[0-9a-f]{16}$/i;

type ReconcileInput = {
  queueId: string;
  contentId: string;
  contentFingerprint: string;
  naverUrl: string;
  expectedLogNo: string;
  title: string;
  corePhrase: string;
  dryRun: boolean;
};

type QueueRow = {
  id: string;
  blog_post_id: string;
  status: string;
  naver_url: string | null;
  blog_post: BlogPostForNaver | BlogPostForNaver[];
};

export async function reconcileNaverPublishSuccess(
  input: ReconcileInput,
  options: { fetchImpl?: typeof fetch } = {},
) {
  if (!UUID_RE.test(input.queueId) || !UUID_RE.test(input.contentId)) throw new Error("valid_queue_and_content_ids_required");
  if (!FINGERPRINT_RE.test(input.contentFingerprint)) throw new Error("valid_content_fingerprint_required");
  if (!/^\d{9,}$/.test(input.expectedLogNo)) throw new Error("valid_naver_log_no_required");

  const identity = parseNaverPublicIdentity(input.naverUrl);
  if (identity.logNo !== input.expectedLogNo) throw new Error("naver_log_no_mismatch");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("naver_blog_queue")
    .select("id, blog_post_id, status, naver_url, blog_post:blog_posts!inner(slug, title, content, meta_description, category, cover_image)")
    .eq("id", input.queueId)
    .maybeSingle();
  if (error) throw new Error(`reconcile_queue_query_failed:${error.message}`);
  if (!data) throw new Error("reconcile_queue_not_found");
  const row = data as unknown as QueueRow;
  if (row.blog_post_id !== input.contentId) throw new Error("content_queue_mismatch");
  const post = Array.isArray(row.blog_post) ? row.blog_post[0] : row.blog_post;
  if (!post) throw new Error("reconcile_content_not_found");

  const payload = convertToNaverBlogHtml(post, { contentId: row.blog_post_id, queueId: row.id });
  const currentFingerprint = createNaverContentFingerprint({
    queueId: row.id,
    contentId: row.blog_post_id,
    title: payload.title,
    bodyHtml: payload.bodyHtml,
    backlinkUrl: payload.backlinkUrl,
    coverImageUrl: payload.coverImageUrl,
  });
  if (input.title !== payload.title) throw new Error("title_identity_mismatch");
  if (input.corePhrase.trim().length < 8) throw new Error("core_phrase_identity_required");

  const publicReadback = await fetchAndVerifyNaverPublicPost({
    naverUrl: identity.publicUrl,
    title: payload.title,
    corePhrase: input.corePhrase,
    queueId: row.id,
    contentId: row.blog_post_id,
    expectedLogNo: input.expectedLogNo,
  }, options.fetchImpl);

  const { data: existingRows, error: existingError } = await admin
    .from("naver_publish_audit")
    .select("id, naver_url, attempted_at, content_fingerprint, details")
    .eq("post_id", input.contentId)
    .eq("result", "success")
    .order("attempted_at", { ascending: true });
  if (existingError) throw new Error(`reconcile_audit_query_failed:${existingError.message}`);
  const successes = existingRows ?? [];
  if (successes.length > 1) throw new Error("duplicate_success_audit_requires_manual_repair");
  if (successes[0]?.naver_url && parseNaverPublicIdentity(successes[0].naver_url).logNo !== identity.logNo) {
    throw new Error("existing_success_points_to_different_post");
  }
  const auditFingerprint = readAuditFingerprint(successes[0]);
  if (successes.length === 0 && input.contentFingerprint !== currentFingerprint) {
    throw new Error("prepublish_content_fingerprint_mismatch");
  }
  if (auditFingerprint && auditFingerprint !== input.contentFingerprint) {
    throw new Error("successful_audit_fingerprint_mismatch");
  }
  const historicalFormatterDrift = successes.length === 1 && input.contentFingerprint !== currentFingerprint;

  const alreadyReconciled = row.status === "published"
    && parseOptionalLogNo(row.naver_url) === identity.logNo
    && successes.length === 1
    && auditFingerprint === input.contentFingerprint;
  if (!input.dryRun && !alreadyReconciled) {
    const { error: rpcError } = await admin.rpc("reconcile_naver_publish_success", {
      p_queue_id: input.queueId,
      p_content_id: input.contentId,
      p_naver_url: identity.publicUrl,
      p_log_no: input.expectedLogNo,
      p_fingerprint: input.contentFingerprint,
    });
    if (rpcError) throw new Error(`reconcile_rpc_failed:${rpcError.message}`);
  }

  if (!input.dryRun) {
    const [{ data: queueReadback, error: queueError }, { data: auditReadback, error: auditError }] = await Promise.all([
      admin.from("naver_blog_queue").select("status, naver_url").eq("id", input.queueId).maybeSingle(),
      admin.from("naver_publish_audit").select("id, naver_url, content_fingerprint").eq("post_id", input.contentId).eq("result", "success"),
    ]);
    if (queueError || auditError) throw new Error("reconcile_database_readback_failed");
    const rows = auditReadback ?? [];
    if (queueReadback?.status !== "published" || parseOptionalLogNo(queueReadback.naver_url) !== identity.logNo
      || rows.length !== 1 || rows[0]?.content_fingerprint !== input.contentFingerprint) {
      throw new Error("reconcile_database_readback_mismatch");
    }
  }

  return {
    ok: true,
    mode: input.dryRun ? "dry_run" as const : "applied" as const,
    mutation: input.dryRun ? "none" as const : (alreadyReconciled ? "none_idempotent" as const : "one_transaction" as const),
    alreadyReconciled,
    identity: {
      queueId: input.queueId,
      contentId: input.contentId,
      contentFingerprint: input.contentFingerprint,
      currentCandidateFingerprint: currentFingerprint,
      logNo: identity.logNo,
      naverUrl: identity.publicUrl,
    },
    publicReadback,
    existingSuccessCount: successes.length,
    revision: historicalFormatterDrift ? "historical_formatter_drift" as const : "current_candidate_matches" as const,
    warning: historicalFormatterDrift
      ? { code: "historical_formatter_drift" as const, currentCandidateFingerprint: currentFingerprint }
      : null,
    wouldPinHistoricalFingerprint: input.dryRun && successes.length === 1 && !auditFingerprint,
  };
}

function readAuditFingerprint(row: { content_fingerprint?: unknown; details?: unknown } | undefined): string | null {
  if (!row) return null;
  if (typeof row.content_fingerprint === "string" && FINGERPRINT_RE.test(row.content_fingerprint)) return row.content_fingerprint;
  const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : null;
  const fallback = details?.contentFingerprint;
  return typeof fallback === "string" && FINGERPRINT_RE.test(fallback) ? fallback : null;
}

function parseOptionalLogNo(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return parseNaverPublicIdentity(value).logNo; } catch { return null; }
}
