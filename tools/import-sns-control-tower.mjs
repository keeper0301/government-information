#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DATA_ROOT = process.env.KEEPIOO_DATA_ROOT ?? '/home/user/.hermes/workspace/claude/data/keepioo';
const REPORTS_DIR = join(DATA_ROOT, 'reports');

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function platformFromReportName(name) {
  if (name.includes('instagram')) return 'instagram';
  if (name.includes('threads')) return 'threads';
  return 'unknown';
}

function groupKeyFromItemId(itemId) {
  return itemId
    .replace(/-project-1to1-\d{8}$/u, '')
    .replace(/-project-noemoji-\d{8}$/u, '')
    .replace(/-identical-style-\d{8}$/u, '')
    .replace(/-project-fontfix-\d{8}$/u, '')
    .replace(/-project-style-\d{8}$/u, '')
    .replace(/-republish-\d{8}$/u, '');
}

function topicFromItemId(itemId) {
  return groupKeyFromItemId(itemId).replace(/^\d{8}-/u, '').replace(/-/gu, ' ');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function extractDeletionReason(response) {
  const error = asRecord(response.error);
  return asString(error.message) ?? asString(response.responseText) ?? null;
}

async function loadDeletionAttempts() {
  const attempts = new Map();
  let names = [];
  try {
    names = await readdir(REPORTS_DIR);
  } catch {
    return attempts;
  }

  for (const name of names.filter((n) => n.startsWith('instagram-delete-') && n.endsWith('.json'))) {
    const reportPath = join(REPORTS_DIR, name);
    const report = await readJson(reportPath);
    const deleted = Array.isArray(report?.deleted) ? report.deleted : [];
    const attemptedAt = asString(report?.checkedAt);
    for (const raw of deleted) {
      const row = asRecord(raw);
      const mediaId = asString(row.mediaId);
      if (!mediaId) continue;
      attempts.set(mediaId, {
        attemptedAt,
        deleteHttpStatus: asNumber(row.deleteHttpStatus),
        verifyGetHttpStatus: asNumber(row.verifyGetHttpStatus),
        reason: extractDeletionReason(asRecord(row.response)),
        reportPath,
      });
    }
  }
  return attempts;
}

function rendererFromValidation(renderValidation) {
  const fontCheck = asRecord(renderValidation.fontCheck);
  const renderers = Array.isArray(fontCheck.renderers) ? fontCheck.renderers : [];
  return asString(renderers[0]) ?? asString(fontCheck.mode);
}

function postFromReport(name, reportPath, report, deletion) {
  const itemId = asString(report.itemId);
  if (!itemId) return null;
  const media = asRecord(report.media);
  const renderValidation = asRecord(report.renderValidation);
  const renderQa = asRecord(renderValidation.renderQa);
  const files = Array.isArray(report.assetUrls) ? report.assetUrls : [];
  const mediaId = asString(media.id);

  return {
    itemId,
    groupKey: groupKeyFromItemId(itemId),
    topic: topicFromItemId(itemId),
    platform: platformFromReportName(name),
    mediaId,
    permalink: asString(media.permalink),
    shortcode: asString(media.shortcode),
    publishedAt: asString(report.publishedAt) ?? asString(media.timestamp),
    renderer: rendererFromValidation(renderValidation),
    renderManifest: asString(renderValidation.manifest),
    renderOk: typeof renderQa.ok === 'boolean' ? renderQa.ok : null,
    assetCount: files.length,
    status: 'unknown',
    deletion,
    reportPath,
  };
}

function publishedTime(post) {
  if (!post.publishedAt) return 0;
  const ms = new Date(post.publishedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function assignStatuses(posts) {
  const byGroup = new Map();
  for (const post of posts) {
    const bucket = byGroup.get(post.groupKey) ?? [];
    bucket.push(post);
    byGroup.set(post.groupKey, bucket);
  }

  const next = posts.map((p) => ({ ...p }));
  const byItem = new Map(next.map((p) => [p.itemId, p]));
  for (const bucket of byGroup.values()) {
    const latest = [...bucket].sort((a, b) => publishedTime(b) - publishedTime(a))[0];
    for (const raw of bucket) {
      const post = byItem.get(raw.itemId);
      if (!post) continue;
      let status = raw.itemId === latest.itemId ? 'active_final' : 'superseded';
      if (raw.deletion?.deleteHttpStatus && raw.deletion.deleteHttpStatus >= 400) {
        status = 'delete_failed_permission';
      }
      post.status = status;
    }
  }
  return next.sort((a, b) => publishedTime(b) - publishedTime(a));
}

async function loadSnapshot() {
  let names = [];
  try {
    names = await readdir(REPORTS_DIR);
  } catch (error) {
    throw new Error(`리포트 디렉터리 읽기 실패: ${REPORTS_DIR}: ${error.message}`);
  }

  const deletionAttempts = await loadDeletionAttempts();
  const posts = [];
  for (const name of names.filter((n) => n.startsWith('instagram-live-publish-') && n.endsWith('.json'))) {
    const reportPath = join(REPORTS_DIR, name);
    const report = await readJson(reportPath);
    if (!report) continue;
    const mediaId = asString(asRecord(report.media).id);
    const post = postFromReport(name, reportPath, report, mediaId ? deletionAttempts.get(mediaId) ?? null : null);
    if (post) posts.push(post);
  }
  return assignStatuses(posts);
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function demoteExistingFinals(admin, posts) {
  const seen = new Set();
  for (const post of posts) {
    const key = `${post.groupKey}::${post.platform}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { error } = await admin
      .from('sns_posts')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('group_key', post.groupKey)
      .eq('platform', post.platform)
      .eq('status', 'active_final');
    if (error) throw new Error(`active_final demote failed (${key}): ${error.message}`);
  }
}

async function upsertPost(admin, post) {
  const { data, error } = await admin
    .from('sns_posts')
    .upsert({
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
    }, { onConflict: 'item_id,platform' })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`sns_posts upsert failed (${post.itemId}): ${error.message}`);
  return data?.id ?? null;
}

async function insertRenderArtifact(admin, snsPostId, post) {
  if (!post.renderer) return;
  const { error } = await admin.from('sns_render_artifacts').insert({
    sns_post_id: snsPostId,
    item_id: post.itemId,
    platform: post.platform,
    renderer: post.renderer,
    manifest_path: post.renderManifest,
    dimensions: '1080x1350',
    asset_count: post.assetCount,
    render_ok: post.renderOk,
    rendered_at: post.publishedAt,
    details: {
      renderer: post.renderer,
      renderManifest: post.renderManifest,
      renderOk: post.renderOk,
      assetCount: post.assetCount,
      deletion: post.deletion,
    },
  });
  if (error) throw new Error(`sns_render_artifacts insert failed (${post.itemId}): ${error.message}`);
}

async function upsertCleanupQueue(admin, snsPostId, post) {
  if (!post.deletion || !post.mediaId) return false;
  await admin.from('sns_cleanup_queue').delete().eq('platform', post.platform).eq('media_id', post.mediaId);
  const status = post.deletion.deleteHttpStatus && post.deletion.deleteHttpStatus >= 400 ? 'failed_permission' : 'pending';
  const { error } = await admin.from('sns_cleanup_queue').insert({
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

async function main() {
  const posts = await loadSnapshot();
  const admin = adminClient();
  const result = { ok: true, imported: 0, cleanupQueued: 0, errors: [] };

  await demoteExistingFinals(admin, posts);
  for (const post of posts) {
    try {
      const id = await upsertPost(admin, post);
      await insertRenderArtifact(admin, id, post);
      if (await upsertCleanupQueue(admin, id, post)) result.cleanupQueued += 1;
      result.imported += 1;
    } catch (error) {
      result.ok = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const { count: postCount, error: postCountError } = await admin
    .from('sns_posts')
    .select('id', { count: 'exact', head: true });
  const { count: cleanupCount, error: cleanupCountError } = await admin
    .from('sns_cleanup_queue')
    .select('id', { count: 'exact', head: true });
  if (postCountError) result.errors.push(`post count failed: ${postCountError.message}`);
  if (cleanupCountError) result.errors.push(`cleanup count failed: ${cleanupCountError.message}`);
  result.dbPostCount = postCount ?? null;
  result.dbCleanupCount = cleanupCount ?? null;

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || result.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
