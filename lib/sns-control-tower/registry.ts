import { createAdminClient } from "@/lib/supabase/admin";
import { loadSnsControlTowerSnapshot } from "./local-report-reader";
import type { SnsControlTowerSnapshot, SnsPublishedPost, SnsPostStatus } from "./types";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type SnsRegistryImportResult = {
  ok: boolean;
  imported: number;
  cleanupQueued: number;
  errors: string[];
};

function detailsForPost(post: SnsPublishedPost) {
  return {
    renderer: post.renderer,
    renderManifest: post.renderManifest,
    renderOk: post.renderOk,
    assetCount: post.assetCount,
    deletion: post.deletion,
  };
}

async function demoteExistingFinals(admin: SupabaseAdmin, posts: SnsPublishedPost[]) {
  const seen = new Set<string>();
  for (const post of posts) {
    const key = `${post.groupKey}::${post.platform}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { error } = await admin
      .from("sns_posts")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("group_key", post.groupKey)
      .eq("platform", post.platform)
      .eq("status", "active_final");
    if (error) throw new Error(`active_final demote failed (${key}): ${error.message}`);
  }
}

async function upsertSnsPost(admin: SupabaseAdmin, post: SnsPublishedPost): Promise<string | null> {
  const payload = {
    group_key: post.groupKey,
    item_id: post.itemId,
    topic: post.topic,
    platform: post.platform,
    media_id: post.mediaId,
    permalink: post.permalink,
    shortcode: post.shortcode,
    status: post.status,
    published_at: post.publishedAt,
    source_report_path: post.reportPath,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("sns_posts")
    .upsert(payload, { onConflict: "item_id,platform" })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`sns_posts upsert failed (${post.itemId}): ${error.message}`);
  return data?.id ?? null;
}

async function insertRenderArtifact(admin: SupabaseAdmin, snsPostId: string | null, post: SnsPublishedPost) {
  if (!post.renderer) return;
  const { error } = await admin.from("sns_render_artifacts").insert({
    sns_post_id: snsPostId,
    item_id: post.itemId,
    platform: post.platform,
    renderer: post.renderer,
    manifest_path: post.renderManifest,
    dimensions: "1080x1350",
    asset_count: post.assetCount,
    render_ok: post.renderOk,
    rendered_at: post.publishedAt,
    details: detailsForPost(post),
  });
  if (error) throw new Error(`sns_render_artifacts insert failed (${post.itemId}): ${error.message}`);
}

async function upsertCleanupQueue(admin: SupabaseAdmin, snsPostId: string | null, post: SnsPublishedPost): Promise<boolean> {
  if (!post.deletion || !post.mediaId) return false;
  await admin.from("sns_cleanup_queue").delete().eq("platform", post.platform).eq("media_id", post.mediaId);
  const status = post.deletion.deleteHttpStatus && post.deletion.deleteHttpStatus >= 400
    ? "failed_permission"
    : "pending";
  const { error } = await admin.from("sns_cleanup_queue").insert({
    sns_post_id: snsPostId,
    platform: post.platform,
    media_id: post.mediaId,
    permalink: post.permalink,
    status,
    reason: post.deletion.reason,
    last_error: post.deletion.reason,
    attempt_count: 1,
    last_attempt_at: post.deletion.attemptedAt,
    source_report_path: post.deletion.reportPath,
  });
  if (error) throw new Error(`sns_cleanup_queue insert failed (${post.itemId}): ${error.message}`);
  return true;
}

export async function importLocalReportsToSnsRegistry(
  admin: SupabaseAdmin = createAdminClient(),
): Promise<SnsRegistryImportResult> {
  const snapshot = await loadSnsControlTowerSnapshot();
  const result: SnsRegistryImportResult = { ok: true, imported: 0, cleanupQueued: 0, errors: [] };

  try {
    await demoteExistingFinals(admin, snapshot.posts);
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  for (const post of snapshot.posts) {
    try {
      const snsPostId = await upsertSnsPost(admin, post);
      await insertRenderArtifact(admin, snsPostId, post);
      if (await upsertCleanupQueue(admin, snsPostId, post)) result.cleanupQueued += 1;
      result.imported += 1;
    } catch (error) {
      result.ok = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

export async function markSnsPostManuallyDeleted(
  mediaId: string,
  admin: SupabaseAdmin = createAdminClient(),
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error: postError } = await admin
    .from("sns_posts")
    .update({ status: "manually_deleted", updated_at: now })
    .eq("media_id", mediaId);
  if (postError) return { ok: false, error: postError.message };

  const { error: cleanupError } = await admin
    .from("sns_cleanup_queue")
    .update({ status: "manually_deleted", resolved_at: now, updated_at: now })
    .eq("media_id", mediaId);
  if (cleanupError) return { ok: false, error: cleanupError.message };

  return { ok: true };
}

type SnsPostRow = {
  item_id: string;
  group_key: string;
  topic: string;
  platform: string;
  media_id: string | null;
  permalink: string | null;
  shortcode: string | null;
  status: string;
  published_at: string | null;
  source_report_path: string | null;
  sns_render_artifacts?: Array<{
    renderer: string | null;
    manifest_path: string | null;
    asset_count: number | null;
    render_ok: boolean | null;
  }>;
  sns_cleanup_queue?: Array<{
    status: string | null;
    reason: string | null;
    last_error: string | null;
    last_attempt_at: string | null;
    source_report_path: string | null;
  }>;
};

function toKnownStatus(status: string): SnsPostStatus {
  if (
    status === "active_final" ||
    status === "superseded" ||
    status === "delete_pending" ||
    status === "delete_failed_permission" ||
    status === "manually_deleted"
  ) {
    return status;
  }
  return "unknown";
}

function rowToPost(row: SnsPostRow): SnsPublishedPost {
  const artifact = row.sns_render_artifacts?.[0];
  const cleanup = row.sns_cleanup_queue?.[0];
  const status = cleanup?.status === "failed_permission" ? "delete_failed_permission" : toKnownStatus(row.status);
  return {
    itemId: row.item_id,
    groupKey: row.group_key,
    topic: row.topic,
    platform: row.platform === "instagram" || row.platform === "threads" ? row.platform : "unknown",
    mediaId: row.media_id,
    permalink: row.permalink,
    shortcode: row.shortcode,
    publishedAt: row.published_at,
    renderer: artifact?.renderer ?? null,
    renderManifest: artifact?.manifest_path ?? null,
    renderOk: artifact?.render_ok ?? null,
    assetCount: artifact?.asset_count ?? 0,
    status,
    deletion: cleanup
      ? {
          attemptedAt: cleanup.last_attempt_at,
          deleteHttpStatus: null,
          verifyGetHttpStatus: null,
          reason: cleanup.last_error ?? cleanup.reason,
          reportPath: cleanup.source_report_path ?? "DB:sns_cleanup_queue",
        }
      : null,
    reportPath: row.source_report_path ?? "DB:sns_posts",
  };
}

function statsForPosts(posts: SnsPublishedPost[]): SnsControlTowerSnapshot["stats"] {
  return {
    total: posts.length,
    activeFinal: posts.filter((p) => p.status === "active_final").length,
    superseded: posts.filter((p) => p.status === "superseded").length,
    deleteFailedPermission: posts.filter((p) => p.status === "delete_failed_permission").length,
    missingPermalink: posts.filter((p) => !p.permalink).length,
  };
}

export async function loadDbSnsControlTowerSnapshot(
  admin: SupabaseAdmin = createAdminClient(),
): Promise<SnsControlTowerSnapshot> {
  const { data, error } = await admin
    .from("sns_posts")
    .select(
      "item_id, group_key, topic, platform, media_id, permalink, shortcode, status, published_at, source_report_path, sns_render_artifacts(renderer, manifest_path, asset_count, render_ok), sns_cleanup_queue(status, reason, last_error, last_attempt_at, source_report_path)",
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(`sns_posts select failed: ${error.message}`);
  const posts = ((data ?? []) as SnsPostRow[]).map(rowToPost);
  return {
    generatedAt: new Date().toISOString(),
    posts,
    stats: statsForPosts(posts),
    warnings: [],
  };
}

export async function loadSnsControlTowerSnapshotDbFirst(): Promise<SnsControlTowerSnapshot> {
  try {
    const db = await loadDbSnsControlTowerSnapshot();
    if (db.posts.length > 0) return db;
    const local = await loadSnsControlTowerSnapshot();
    return {
      ...local,
      warnings: ["DB 원장이 비어 있어 Hermes 로컬 리포트로 fallback 표시 중", ...local.warnings],
    };
  } catch (error) {
    const local = await loadSnsControlTowerSnapshot();
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...local,
      warnings: [`DB 원장 조회 실패, Hermes 로컬 리포트로 fallback: ${message}`, ...local.warnings],
    };
  }
}
