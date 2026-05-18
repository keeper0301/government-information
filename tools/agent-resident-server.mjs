#!/usr/bin/env node
/**
 * Server-grade resident operations worker.
 *
 * Run this on an always-on host (Render Starter, VPS, systemd, Docker). It keeps
 * a process alive, exposes /health, and continuously triggers the in-site
 * autonomous resident cycle.
 */

import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_SITE_BASE_URL = "https://www.keepioo.com";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 55 * 1000;

const startedAt = Date.now();
const state = {
  running: false,
  lastRunAt: null,
  lastOkAt: null,
  lastStatus: null,
  lastError: null,
  consecutiveFailures: 0,
  totalRuns: 0,
  totalFailures: 0,
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

  return {
    siteBaseUrl,
    cronSecret,
    port,
    intervalMs,
    cycleUrl: `${siteBaseUrl}/api/cron/agent-resident-cycle`,
  };
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
      lastStatus: state.lastStatus,
      lastError: state.lastError,
      consecutiveFailures: state.consecutiveFailures,
      totalRuns: state.totalRuns,
      totalFailures: state.totalFailures,
    },
    automation: {
      telegram: true,
      policyDb: true,
      contentGeneration: true,
      threadsPublishing: false,
      instagramMetrics: true,
      instagramComments: false,
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
      const result = await runCycle(config, "server_resident_manual");
      res.writeHead(result.ok ? 200 : 202, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
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
  await runCycle(config, "server_resident_startup");
  for (;;) {
    await sleep(config.intervalMs);
    await runCycle(config, "server_resident_worker");
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
    console.log(JSON.stringify({ ok: true, siteBaseUrl: config.siteBaseUrl }));
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
