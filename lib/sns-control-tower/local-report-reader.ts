import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SnsControlTowerSnapshot,
  SnsDeletionAttempt,
  SnsPlatform,
  SnsPublishedPost,
  SnsPostStatus,
} from "./types";

const DEFAULT_KEEPIOO_DATA_ROOT =
  process.env.KEEPIOO_DATA_ROOT ?? "/home/user/.hermes/workspace/claude/data/keepioo";
const REPORTS_DIR = join(DEFAULT_KEEPIOO_DATA_ROOT, "reports");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function platformFromReportName(name: string): SnsPlatform {
  if (name.includes("instagram")) return "instagram";
  if (name.includes("threads")) return "threads";
  return "unknown";
}

function groupKeyFromItemId(itemId: string): string {
  return itemId
    .replace(/-project-1to1-\d{8}$/u, "")
    .replace(/-project-noemoji-\d{8}$/u, "")
    .replace(/-identical-style-\d{8}$/u, "")
    .replace(/-project-fontfix-\d{8}$/u, "")
    .replace(/-project-style-\d{8}$/u, "")
    .replace(/-republish-\d{8}$/u, "");
}

function topicFromItemId(itemId: string): string {
  const key = groupKeyFromItemId(itemId).replace(/^\d{8}-/u, "");
  return key.replace(/-/gu, " ");
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractDeletionReason(response: Record<string, unknown>): string | null {
  const error = asRecord(response.error);
  return asString(error.message) ?? asString(response.responseText) ?? null;
}

async function loadDeletionAttempts(): Promise<Map<string, SnsDeletionAttempt>> {
  const attempts = new Map<string, SnsDeletionAttempt>();
  let names: string[] = [];
  try {
    names = await readdir(REPORTS_DIR);
  } catch {
    return attempts;
  }

  for (const name of names.filter((n) => n.startsWith("instagram-delete-") && n.endsWith(".json"))) {
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

function rendererFromValidation(renderValidation: Record<string, unknown>): string | null {
  const fontCheck = asRecord(renderValidation.fontCheck);
  const renderers = Array.isArray(fontCheck.renderers) ? fontCheck.renderers : [];
  return asString(renderers[0]) ?? asString(fontCheck.mode);
}

function postFromReport(
  name: string,
  reportPath: string,
  report: Record<string, unknown>,
  deletion: SnsDeletionAttempt | null,
): SnsPublishedPost | null {
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
    renderOk: typeof renderQa.ok === "boolean" ? renderQa.ok : null,
    assetCount: files.length,
    status: "unknown",
    deletion,
    reportPath,
  };
}

function publishedTime(post: SnsPublishedPost): number {
  if (!post.publishedAt) return 0;
  const ms = new Date(post.publishedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function assignStatuses(posts: SnsPublishedPost[]): SnsPublishedPost[] {
  const byGroup = new Map<string, SnsPublishedPost[]>();
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
      let status: SnsPostStatus = raw.itemId === latest.itemId ? "active_final" : "superseded";
      if (raw.deletion?.deleteHttpStatus && raw.deletion.deleteHttpStatus >= 400) {
        status = "delete_failed_permission";
      }
      post.status = status;
    }
  }
  return next.sort((a, b) => publishedTime(b) - publishedTime(a));
}

export async function loadSnsControlTowerSnapshot(): Promise<SnsControlTowerSnapshot> {
  const warnings: string[] = [];
  let names: string[] = [];
  try {
    names = await readdir(REPORTS_DIR);
  } catch {
    warnings.push(`리포트 디렉터리를 읽지 못함: ${REPORTS_DIR}`);
  }

  const deletionAttempts = await loadDeletionAttempts();
  const posts: SnsPublishedPost[] = [];
  for (const name of names.filter((n) => n.startsWith("instagram-live-publish-") && n.endsWith(".json"))) {
    const reportPath = join(REPORTS_DIR, name);
    const report = await readJson(reportPath);
    if (!report) continue;
    const mediaId = asString(asRecord(report.media).id);
    const post = postFromReport(name, reportPath, report, mediaId ? deletionAttempts.get(mediaId) ?? null : null);
    if (post) posts.push(post);
  }

  const finalPosts = assignStatuses(posts);
  const stats = {
    total: finalPosts.length,
    activeFinal: finalPosts.filter((p) => p.status === "active_final").length,
    superseded: finalPosts.filter((p) => p.status === "superseded").length,
    deleteFailedPermission: finalPosts.filter((p) => p.status === "delete_failed_permission").length,
    missingPermalink: finalPosts.filter((p) => !p.permalink).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    posts: finalPosts,
    stats,
    warnings,
  };
}
