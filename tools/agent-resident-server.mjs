#!/usr/bin/env node
/**
 * 서버급 상시 운영 워커.
 *
 * Render Starter, VPS, systemd, Docker 같은 항상 켜져 있는 환경에서 실행한다.
 * 프로세스를 계속 살려두고, /health 상태 확인을 열며, 사이트 내부 자율 운영
 * 사이클을 계속 호출한다.
 */

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  buildSiteDownAlert,
  checkPublicSite,
  parseOwnerChatIds,
  sendTelegramAlert,
} from "./resident-monitor.mjs";
import {
  buildManagerAlert,
  readAiManagerConfig,
  runAiManager,
  shouldRunAiManager,
} from "./autonomous-ai-manager.mjs";
import {
  buildBlogManagerAlert,
  readBlogManagerConfig,
  runBlogManager,
  shouldRunBlogManager,
} from "./blog-manager.mjs";
import {
  buildSiteMaintenanceAlert,
  readSiteMaintenanceConfig,
  runSiteMaintenanceManager,
  shouldRunSiteMaintenance,
} from "./site-maintenance-manager.mjs";
import {
  buildSiteUpgradeAlert,
  readSiteUpgradeConfig,
  runSiteUpgradeManager,
  shouldRunSiteUpgrade,
} from "./site-upgrade-manager.mjs";
import {
  handleOuterResponsesRequest,
  readOuterGatewayConfig,
} from "./outer-gateway.mjs";

const DEFAULT_SITE_BASE_URL = "https://www.keepioo.com";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 55 * 1000;
const SITE_ALERT_AFTER_FAILURES = 2;
const SITE_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

loadLocalEnv();

const startedAt = Date.now();
const state = {
  running: false,
  lastRunAt: null,
  lastOkAt: null,
  lastFailureAt: null,
  lastStatus: null,
  lastError: null,
  consecutiveFailures: 0,
  totalRuns: 0,
  totalFailures: 0,
  site: {
    lastCheckAt: null,
    lastOkAt: null,
    lastFailureAt: null,
    lastResults: [],
    consecutiveFailures: 0,
    totalChecks: 0,
    totalFailures: 0,
    lastAlertAt: null,
    lastAlertError: null,
  },
  aiManager: {
    lastRunAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    lastDecision: null,
    totalRuns: 0,
    totalFailures: 0,
  },
  blogManager: {
    lastRunAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    lastBackupPublishAt: null,
    lastResult: null,
    totalRuns: 0,
    totalFailures: 0,
  },
  siteMaintenance: {
    lastRunAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    lastResult: null,
    totalRuns: 0,
    totalFailures: 0,
  },
  siteUpgrade: {
    lastRunAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    lastResult: null,
    totalRuns: 0,
    totalFailures: 0,
  },
};

function readConfig() {
  const siteBaseUrl = trimTrailingSlash(
    process.env.SITE_BASE_URL || DEFAULT_SITE_BASE_URL,
  );
  const cronSecret = process.env.CRON_SECRET || "";
  const port = Number(process.env.PORT || 8787);
  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    Number(process.env.AGENT_RESIDENT_INTERVAL_MS || DEFAULT_INTERVAL_MS),
  );
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const telegramChatIds = parseOwnerChatIds();
  const aiManager = readAiManagerConfig();
  const blogManager = readBlogManagerConfig();
  const siteMaintenance = readSiteMaintenanceConfig();
  const siteUpgrade = readSiteUpgradeConfig();
  const outerGateway = readOuterGatewayConfig();

  return {
    siteBaseUrl,
    cronSecret,
    port,
    intervalMs,
    telegramToken,
    telegramChatIds,
    aiManager,
    blogManager,
    siteMaintenance,
    siteUpgrade,
    outerGateway,
    cycleUrl: `${siteBaseUrl}/api/cron/agent-resident-cycle`,
  };
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = cleanEnvValue(trimmed.slice(eqIndex + 1).trim());
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = value;
  }
}

function cleanEnvValue(value) {
  const quote = value[0];
  const last = value[value.length - 1];
  if ((quote === '"' || quote === "'") && last === quote) {
    return value.slice(1, -1);
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function validateConfig(config) {
  const missing = [];
  if (!config.cronSecret) missing.push("CRON_SECRET");
  if (!config.siteBaseUrl.startsWith("https://")) missing.push("SITE_BASE_URL_https");
  return missing;
}

async function runCycle(config, source = "server_resident_worker") {
  if (state.running) {
    return { skipped: true, reason: "already_running" };
  }

  state.running = true;
  state.lastRunAt = new Date().toISOString();
  state.totalRuns += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(config.cycleUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.cronSecret}`,
        "content-type": "application/json",
        "x-agent-resident-source": source,
      },
      body: JSON.stringify({ source }),
      signal: controller.signal,
    });
    const text = await res.text();
    const body = safeJson(text);
    state.lastStatus = res.status;
    if (!res.ok) {
      throw new Error(`resident cycle HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    state.lastOkAt = new Date().toISOString();
    state.lastError = null;
    state.consecutiveFailures = 0;
    console.log(
      JSON.stringify({
        level: "info",
        event: "resident_cycle_ok",
        status: res.status,
        body,
      }),
    );
    return { ok: true, status: res.status, body };
  } catch (error) {
    state.totalFailures += 1;
    state.consecutiveFailures += 1;
    state.lastFailureAt = new Date().toISOString();
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "resident_cycle_failed",
        error: state.lastError,
        consecutiveFailures: state.consecutiveFailures,
      }),
    );
    return { ok: false, error: state.lastError };
  } finally {
    clearTimeout(timer);
    state.running = false;
  }
}

async function runSiteMonitor(config) {
  const site = await checkPublicSite({ baseUrl: config.siteBaseUrl });
  state.site.totalChecks += 1;
  state.site.lastCheckAt = site.checkedAt;
  state.site.lastResults = site.results;

  if (site.ok) {
    state.site.lastOkAt = site.checkedAt;
    state.site.lastAlertError = null;
    state.site.consecutiveFailures = 0;
    console.log(
      JSON.stringify({
        level: "info",
        event: "resident_site_ok",
        checked: site.checked,
        slow: site.slow,
      }),
    );
    return site;
  }

  state.site.totalFailures += 1;
  state.site.lastFailureAt = site.checkedAt;
  state.site.consecutiveFailures += 1;

  console.error(
    JSON.stringify({
      level: "error",
      event: "resident_site_failed",
      failed: site.failed,
      checked: site.checked,
      consecutiveFailures: state.site.consecutiveFailures,
      results: site.results,
    }),
  );

  await maybeSendSiteAlert(config, site);
  return site;
}

async function maybeSendSiteAlert(config, site) {
  if (state.site.consecutiveFailures < SITE_ALERT_AFTER_FAILURES) return;
  const lastAlertMs = state.site.lastAlertAt
    ? Date.parse(state.site.lastAlertAt)
    : 0;
  if (Date.now() - lastAlertMs < SITE_ALERT_COOLDOWN_MS) return;

  const alert = buildSiteDownAlert({
    site,
    consecutiveFailures: state.site.consecutiveFailures,
    baseUrl: config.siteBaseUrl,
  });
  if (!alert) return;

  const result = await sendTelegramAlert({
    token: config.telegramToken,
    chatIds: config.telegramChatIds,
    subject: alert.subject,
    message: alert.message,
  });
  state.site.lastAlertAt = new Date().toISOString();
  state.site.lastAlertError = result.ok ? null : JSON.stringify(result);

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "warn",
      event: "resident_site_alert",
      result,
    }),
  );
}

async function maybeRunAiManager(config, site, cycle) {
  if (
    !shouldRunAiManager({
      nowMs: Date.now(),
      lastRunAt: state.aiManager.lastRunAt,
      site,
      intervalMs: config.aiManager.intervalMs,
    })
  ) {
    return { skipped: true, reason: "interval_not_reached" };
  }

  state.aiManager.totalRuns += 1;
  state.aiManager.lastRunAt = new Date().toISOString();
  const result = await runAiManager({
    config: config.aiManager,
    site,
    cycle,
  });

  if (result.ok) {
    state.aiManager.lastOkAt = new Date().toISOString();
    state.aiManager.lastError = null;
    state.aiManager.lastDecision = result.decision;
    const alert = buildManagerAlert(result);
    if (alert) {
      await sendTelegramAlert({
        token: config.telegramToken,
        chatIds: config.telegramChatIds,
        subject: alert.subject,
        message: alert.message,
      });
    }
  } else if (!result.skipped) {
    state.aiManager.totalFailures += 1;
    state.aiManager.lastErrorAt = new Date().toISOString();
    state.aiManager.lastError = JSON.stringify(result).slice(0, 1000);
  }

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "warn",
      event: "resident_ai_manager",
      result,
    }),
  );
  return result;
}

async function maybeRunBlogManager(config, cycle) {
  if (
    !shouldRunBlogManager({
      nowMs: Date.now(),
      lastRunAt: state.blogManager.lastRunAt,
      intervalMs: config.blogManager.intervalMs,
    })
  ) {
    return { skipped: true, reason: "interval_not_reached" };
  }

  state.blogManager.totalRuns += 1;
  state.blogManager.lastRunAt = new Date().toISOString();
  const result = await runBlogManager({
    config: config.blogManager,
    siteBaseUrl: config.siteBaseUrl,
    cronSecret: config.cronSecret,
    cycle,
    lastBackupPublishAt: state.blogManager.lastBackupPublishAt,
  });
  state.blogManager.lastResult = result;

  if (result.ok) {
    state.blogManager.lastOkAt = new Date().toISOString();
    state.blogManager.lastError = null;
    if (result.backupAttempted) {
      state.blogManager.lastBackupPublishAt = new Date().toISOString();
    }
  } else if (!result.skipped) {
    state.blogManager.totalFailures += 1;
    state.blogManager.lastErrorAt = new Date().toISOString();
    state.blogManager.lastError = JSON.stringify(result).slice(0, 1000);
  }

  const alert = buildBlogManagerAlert(result);
  if (alert) {
    await sendTelegramAlert({
      token: config.telegramToken,
      chatIds: config.telegramChatIds,
      subject: alert.subject,
      message: alert.message,
    });
  }

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "warn",
      event: "resident_blog_manager",
      result,
    }),
  );
  return result;
}

async function maybeRunSiteMaintenance(config) {
  if (
    !shouldRunSiteMaintenance({
      nowMs: Date.now(),
      lastRunAt: state.siteMaintenance.lastRunAt,
      intervalMs: config.siteMaintenance.intervalMs,
    })
  ) {
    return { skipped: true, reason: "interval_not_reached" };
  }

  state.siteMaintenance.totalRuns += 1;
  state.siteMaintenance.lastRunAt = new Date().toISOString();
  const result = await runSiteMaintenanceManager({
    config: config.siteMaintenance,
    siteBaseUrl: config.siteBaseUrl,
    cronSecret: config.cronSecret,
  });
  state.siteMaintenance.lastResult = result;

  if (result.ok) {
    state.siteMaintenance.lastOkAt = new Date().toISOString();
    state.siteMaintenance.lastError = null;
  } else if (!result.skipped) {
    state.siteMaintenance.totalFailures += 1;
    state.siteMaintenance.lastErrorAt = new Date().toISOString();
    state.siteMaintenance.lastError = JSON.stringify(result).slice(0, 1000);
  }

  const alert = buildSiteMaintenanceAlert(result);
  if (alert) {
    await sendTelegramAlert({
      token: config.telegramToken,
      chatIds: config.telegramChatIds,
      subject: alert.subject,
      message: alert.message,
    });
  }

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "warn",
      event: "resident_site_maintenance",
      result,
    }),
  );
  return result;
}

async function maybeRunSiteUpgrade(config) {
  if (
    !shouldRunSiteUpgrade({
      nowMs: Date.now(),
      lastRunAt: state.siteUpgrade.lastRunAt,
      intervalMs: config.siteUpgrade.intervalMs,
    })
  ) {
    return { skipped: true, reason: "interval_not_reached" };
  }

  state.siteUpgrade.totalRuns += 1;
  state.siteUpgrade.lastRunAt = new Date().toISOString();
  const result = await runSiteUpgradeManager({
    config: config.siteUpgrade,
    siteBaseUrl: config.siteBaseUrl,
    cronSecret: config.cronSecret,
  });
  state.siteUpgrade.lastResult = result;

  if (result.ok) {
    state.siteUpgrade.lastOkAt = new Date().toISOString();
    state.siteUpgrade.lastError = null;
  } else if (!result.skipped) {
    state.siteUpgrade.totalFailures += 1;
    state.siteUpgrade.lastErrorAt = new Date().toISOString();
    state.siteUpgrade.lastError = JSON.stringify(result).slice(0, 1000);
  }

  const alert = buildSiteUpgradeAlert(result);
  if (alert) {
    await sendTelegramAlert({
      token: config.telegramToken,
      chatIds: config.telegramChatIds,
      subject: alert.subject,
      message: alert.message,
    });
  }

  console.log(
    JSON.stringify({
      level: result.ok ? "info" : "warn",
      event: "resident_site_upgrade",
      result,
    }),
  );
  return result;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function health(config) {
  const missing = validateConfig(config);
  return {
    ok: missing.length === 0 && state.consecutiveFailures < 3,
    ready: missing.length === 0,
    checkedAt: new Date().toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    env: { missingRequired: missing },
    resident: {
      siteBaseUrl: config.siteBaseUrl,
      intervalMs: config.intervalMs,
      running: state.running,
      lastRunAt: state.lastRunAt,
      lastOkAt: state.lastOkAt,
      lastFailureAt: state.lastFailureAt,
      lastStatus: state.lastStatus,
      lastError: state.lastError,
      consecutiveFailures: state.consecutiveFailures,
      totalRuns: state.totalRuns,
      totalFailures: state.totalFailures,
    },
    site: {
      lastCheckAt: state.site.lastCheckAt,
      lastOkAt: state.site.lastOkAt,
      lastFailureAt: state.site.lastFailureAt,
      lastResults: state.site.lastResults,
      consecutiveFailures: state.site.consecutiveFailures,
      totalChecks: state.site.totalChecks,
      totalFailures: state.site.totalFailures,
      lastAlertAt: state.site.lastAlertAt,
      lastAlertError: state.site.lastAlertError,
      telegramConfigured:
        !!config.telegramToken && config.telegramChatIds.length > 0,
    },
    aiManager: {
      enabled: config.aiManager.enabled,
      model: config.aiManager.model,
      baseUrl: config.aiManager.baseUrl,
      permissionLevel: config.aiManager.permissionLevel,
      intervalMs: config.aiManager.intervalMs,
      configured: !!config.aiManager.authToken,
      lastRunAt: state.aiManager.lastRunAt,
      lastOkAt: state.aiManager.lastOkAt,
      lastErrorAt: state.aiManager.lastErrorAt,
      lastError: state.aiManager.lastError,
      lastDecision: state.aiManager.lastDecision,
      totalRuns: state.aiManager.totalRuns,
      totalFailures: state.aiManager.totalFailures,
    },
    blogManager: {
      enabled: config.blogManager.enabled,
      allowBackupPublish: config.blogManager.allowBackupPublish,
      intervalMs: config.blogManager.intervalMs,
      backupPublishGapMs: config.blogManager.backupPublishGapMs,
      lastRunAt: state.blogManager.lastRunAt,
      lastOkAt: state.blogManager.lastOkAt,
      lastErrorAt: state.blogManager.lastErrorAt,
      lastError: state.blogManager.lastError,
      lastBackupPublishAt: state.blogManager.lastBackupPublishAt,
      lastResult: state.blogManager.lastResult,
      totalRuns: state.blogManager.totalRuns,
      totalFailures: state.blogManager.totalFailures,
    },
    siteMaintenance: {
      enabled: config.siteMaintenance.enabled,
      intervalMs: config.siteMaintenance.intervalMs,
      lastRunAt: state.siteMaintenance.lastRunAt,
      lastOkAt: state.siteMaintenance.lastOkAt,
      lastErrorAt: state.siteMaintenance.lastErrorAt,
      lastError: state.siteMaintenance.lastError,
      lastResult: state.siteMaintenance.lastResult,
      totalRuns: state.siteMaintenance.totalRuns,
      totalFailures: state.siteMaintenance.totalFailures,
    },
    siteUpgrade: {
      enabled: config.siteUpgrade.enabled,
      intervalMs: config.siteUpgrade.intervalMs,
      lastRunAt: state.siteUpgrade.lastRunAt,
      lastOkAt: state.siteUpgrade.lastOkAt,
      lastErrorAt: state.siteUpgrade.lastErrorAt,
      lastError: state.siteUpgrade.lastError,
      lastResult: state.siteUpgrade.lastResult,
      totalRuns: state.siteUpgrade.totalRuns,
      totalFailures: state.siteUpgrade.totalFailures,
    },
    outerGateway: {
      enabled: config.outerGateway.enabled,
      configured: !!config.outerGateway.authToken,
      mode: config.outerGateway.mode,
      upstreamConfigured:
        !!config.outerGateway.upstreamBaseUrl &&
        !!config.outerGateway.upstreamAuthToken,
    },
    automation: {
      telegram: true,
      policyDb: true,
      contentGeneration: true,
      threadsPublishing: true,
      instagramMetrics: true,
      instagramComments: true,
    },
  };
}

function startHealthServer(config) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      const body = health(config);
      res.writeHead(body.ok ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    if (url.pathname === "/run-once" && req.method === "POST") {
      const site = await runSiteMonitor(config);
      const result = await runCycle(config, "server_resident_manual");
      const blogManager = await maybeRunBlogManager(config, result);
      const siteMaintenance = await maybeRunSiteMaintenance(config);
      const siteUpgrade = await maybeRunSiteUpgrade(config);
      const aiManager = await maybeRunAiManager(config, site, result);
      res.writeHead(result.ok ? 200 : 202, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          site,
          cycle: result,
          blogManager,
          siteMaintenance,
          siteUpgrade,
          aiManager,
        }),
      );
      return;
    }

    if (url.pathname === "/responses" && req.method === "POST") {
      await handleOuterResponsesRequest({
        req,
        res,
        config: config.outerGateway,
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "요청한 주소를 찾을 수 없습니다." }));
  });

  server.listen(config.port, () => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "resident_server_started",
        port: config.port,
        siteBaseUrl: config.siteBaseUrl,
        intervalMs: config.intervalMs,
      }),
    );
  });
}

async function scheduler(config) {
  const firstSite = await runSiteMonitor(config);
  const firstCycle = await runCycle(config, "server_resident_startup");
  await maybeRunBlogManager(config, firstCycle);
  await maybeRunSiteMaintenance(config);
  await maybeRunSiteUpgrade(config);
  await maybeRunAiManager(config, firstSite, firstCycle);
  for (;;) {
    await sleep(config.intervalMs);
    const site = await runSiteMonitor(config);
    const cycle = await runCycle(config, "server_resident_worker");
    await maybeRunBlogManager(config, cycle);
    await maybeRunSiteMaintenance(config);
    await maybeRunSiteUpgrade(config);
    await maybeRunAiManager(config, site, cycle);
  }
}

async function main() {
  const config = readConfig();
  const missing = validateConfig(config);

  if (process.argv.includes("--check-config")) {
    if (missing.length > 0) {
      console.error(JSON.stringify({ ok: false, missing }));
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        ok: true,
        siteBaseUrl: config.siteBaseUrl,
        telegramConfigured:
          !!config.telegramToken && config.telegramChatIds.length > 0,
        aiManagerEnabled: config.aiManager.enabled,
        aiManagerConfigured: !!config.aiManager.authToken,
        blogManagerEnabled: config.blogManager.enabled,
        blogBackupPublishAllowed: config.blogManager.allowBackupPublish,
        siteMaintenanceEnabled: config.siteMaintenance.enabled,
        siteUpgradeEnabled: config.siteUpgrade.enabled,
        outerGatewayEnabled: config.outerGateway.enabled,
        outerGatewayConfigured: !!config.outerGateway.authToken,
        outerGatewayMode: config.outerGateway.mode,
      }),
    );
    return;
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({ level: "fatal", event: "config_missing", missing }));
    process.exit(1);
  }

  startHealthServer(config);
  await scheduler(config);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      event: "resident_server_crashed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
