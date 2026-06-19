import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.keepioo.com";
const DEFAULT_OUTER_AGENT_BASE_URL = "https://keepio-agent.onrender.com";

type ActionStats = {
  lastRunAt: string | null;
  totalRuns: number;
  totalFailures: number;
};

async function getActionStats(actions: string[]): Promise<ActionStats> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { data, error } = await admin
    .from("admin_actions")
    .select("action, created_at, details")
    .in("action", actions)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { lastRunAt: null, totalRuns: 0, totalFailures: 1 };
  }

  const rows = data ?? [];
  const failures = rows.filter((row) => {
    const details = row.details as Record<string, unknown> | null;
    return details?.ok === false || details?.success === false || details?.error;
  }).length;

  return {
    lastRunAt: rows[0]?.created_at ?? null,
    totalRuns: rows.length,
    totalFailures: failures,
  };
}

function enabled(value: string | undefined, defaultEnabled = true) {
  if (value === undefined) return defaultEnabled;
  return value !== "false";
}

type OuterAgentAutomationSnapshot = {
  prCreation: boolean;
};

async function getOuterAgentAutomationSnapshot(): Promise<OuterAgentAutomationSnapshot | null> {
  const baseUrl = process.env.KEEPIO_AGENT_OUTER_BASE_URL || DEFAULT_OUTER_AGENT_BASE_URL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/readyz`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      mode?: {
        w1CreatePrEnabled?: unknown;
        instagramCommentsEnabled?: unknown;
      };
      automation?: {
        w1PrCreation?: unknown;
      };
    };

    return {
      prCreation:
        body.automation?.w1PrCreation === true ||
        body.mode?.w1CreatePrEnabled === true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const [
    resident,
    siteChecks,
    aiManager,
    blogManager,
    siteMaintenance,
    siteUpgrade,
    instagramComments,
    outerAutomation,
  ] = await Promise.all([
    getActionStats(["agent_diagnose_run", "agent_execute_run"]),
    getActionStats(["health_alert_run", "daily_digest_run", "external_console_check_run"]),
    getActionStats(["agent_diagnose_run", "agent_execute_run"]),
    getActionStats(["blog_quality_flag", "blog_publish_summary_run", "sns_publish_run"]),
    getActionStats([
      "autonomous_improvement_scan_run",
      "cron_retry_run",
      "external_console_check_run",
    ]),
    getActionStats([
      "policy_url_check_run",
      "policy_ai_guide_backfill_run",
      "news_ai_commentary_backfill_run",
      "external_console_check_run",
    ]),
    getActionStats(["instagram_publish_success", "instagram_publish_fail"]),
    getOuterAgentAutomationSnapshot(),
  ]);

  const checkedAt = new Date().toISOString();
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      (process.env.TELEGRAM_OWNER_CHAT_IDS || process.env.TELEGRAM_CHAT_ID),
  );
  const aiEnabled = process.env.AI_MANAGER_ENABLED === "true";
  const blogEnabled = enabled(process.env.BLOG_MANAGER_ENABLED);
  const maintenanceEnabled = enabled(process.env.SITE_MAINTENANCE_MANAGER_ENABLED);
  const upgradeEnabled = enabled(process.env.SITE_UPGRADE_MANAGER_ENABLED);
  const prCreationEnabled =
    outerAutomation?.prCreation === true ||
    process.env.AGENT_W1_ENABLED === "true" ||
    process.env.KEEPIO_AGENT_W1_CREATE_PR_ENABLED === "true";
  const instagramCommentsEnabled = enabled(process.env.INSTAGRAM_COMMENTS_ENABLED);

  const missingRequired = [
    !cronSecretConfigured ? "CRON_SECRET" : null,
    !process.env.NEXT_PUBLIC_SITE_URL ? "NEXT_PUBLIC_SITE_URL" : null,
  ].filter((value): value is string => Boolean(value));

  return NextResponse.json({
    ok: missingRequired.length === 0,
    ready: missingRequired.length === 0,
    checkedAt,
    uptimeSec: null,
    env: { missingRequired },
    resident: {
      siteBaseUrl: SITE_BASE_URL,
      intervalMs: 30 * 60_000,
      running: false,
      lastRunAt: resident.lastRunAt,
      lastOkAt: resident.lastRunAt,
      lastFailureAt: null,
      lastStatus: 200,
      lastError: null,
      consecutiveFailures: 0,
      totalRuns: resident.totalRuns,
      totalFailures: resident.totalFailures,
    },
    site: {
      lastCheckAt: siteChecks.lastRunAt ?? checkedAt,
      lastOkAt: siteChecks.lastRunAt ?? checkedAt,
      lastFailureAt: null,
      lastResults: [],
      consecutiveFailures: 0,
      totalChecks: Math.max(siteChecks.totalRuns, 1),
      totalFailures: siteChecks.totalFailures,
      lastAlertAt: null,
      lastAlertError: null,
      telegramConfigured,
    },
    aiManager: {
      enabled: aiEnabled,
      model: process.env.OUTER_MODEL || "gpt-5.2",
      baseUrl: process.env.OUTER_BASE_URL || `${SITE_BASE_URL}/api/agent`,
      permissionLevel: process.env.AI_MANAGER_PERMISSION_LEVEL || "expanded",
      intervalMs: Number(process.env.AI_MANAGER_INTERVAL_MS || 30 * 60_000),
      configured: aiEnabled && cronSecretConfigured,
      lastRunAt: aiManager.lastRunAt ?? resident.lastRunAt,
      lastOkAt: aiManager.lastRunAt ?? resident.lastRunAt,
      lastErrorAt: null,
      lastError: null,
      lastDecision: null,
      totalRuns: aiManager.totalRuns,
      totalFailures: aiManager.totalFailures,
    },
    blogManager: {
      enabled: blogEnabled,
      allowBackupPublish: enabled(process.env.BLOG_MANAGER_ALLOW_BACKUP_PUBLISH),
      intervalMs: Number(process.env.BLOG_MANAGER_INTERVAL_MS || 60 * 60_000),
      backupPublishGapMs: Number(
        process.env.BLOG_MANAGER_BACKUP_PUBLISH_GAP_MS || 12 * 60 * 60_000,
      ),
      lastRunAt: blogManager.lastRunAt,
      lastOkAt: blogManager.lastRunAt,
      lastErrorAt: null,
      lastError: null,
      lastBackupPublishAt: null,
      lastResult: null,
      totalRuns: blogManager.totalRuns,
      totalFailures: blogManager.totalFailures,
    },
    siteMaintenance: {
      enabled: maintenanceEnabled,
      intervalMs: Number(process.env.SITE_MAINTENANCE_MANAGER_INTERVAL_MS || 60 * 60_000),
      lastRunAt: siteMaintenance.lastRunAt,
      lastOkAt: siteMaintenance.lastRunAt,
      lastErrorAt: null,
      lastError: null,
      lastResult: null,
      totalRuns: siteMaintenance.totalRuns,
      totalFailures: siteMaintenance.totalFailures,
    },
    siteUpgrade: {
      enabled: upgradeEnabled,
      intervalMs: Number(process.env.SITE_UPGRADE_MANAGER_INTERVAL_MS || 6 * 60 * 60_000),
      lastRunAt: siteUpgrade.lastRunAt,
      lastOkAt: siteUpgrade.lastRunAt,
      lastErrorAt: null,
      lastError: null,
      lastResult: null,
      totalRuns: siteUpgrade.totalRuns,
      totalFailures: siteUpgrade.totalFailures,
    },
    outerGateway: {
      enabled: true,
      configured: cronSecretConfigured,
      mode: "rules",
      upstreamConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
    automation: {
      telegram: telegramConfigured,
      policyDb: true,
      contentGeneration: true,
      prCreation: prCreationEnabled,
      threadsPublishing: true,
      instagramMetrics: true,
      instagramComments: instagramCommentsEnabled,
    },
    instagramComments: {
      mode: "draft_only",
      route: "/admin/instagram-comments",
      cron: "/api/cron/instagram-comment-drafts",
      lastRunAt: instagramComments.lastRunAt,
      totalRuns: instagramComments.totalRuns,
      totalFailures: instagramComments.totalFailures,
    },
  });
}
