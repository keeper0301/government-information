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

const DEFAULT_SITE_BASE_URL = "https://www.keepioo.com";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 55 * 1000;

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
