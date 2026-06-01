const DEFAULT_SITE_UPGRADE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function readSiteUpgradeConfig(env = process.env) {
  return {
    enabled: env.SITE_UPGRADE_MANAGER_ENABLED !== "false",
    intervalMs: Math.max(
      60 * 60 * 1000,
      Number(
        env.SITE_UPGRADE_MANAGER_INTERVAL_MS ||
          DEFAULT_SITE_UPGRADE_INTERVAL_MS,
      ),
    ),
  };
}

export function shouldRunSiteUpgrade({ nowMs, lastRunAt, intervalMs }) {
  if (!lastRunAt) return true;
  return nowMs - Date.parse(lastRunAt) >= intervalMs;
}

export function buildSiteUpgradeAlert(result) {
  if (!result.ok) {
    return {
      subject: "[keepioo 사이트 업그레이드] 실행 실패",
      message: JSON.stringify(result).slice(0, 1500),
    };
  }
  const failed = result.actions.filter((action) => !action.ok);
  if (failed.length === 0) return null;
  return {
    subject: `[keepioo 사이트 업그레이드] ${failed.length}건 실패`,
    message: failed
      .map((action) => `- ${action.name}: ${action.status ?? action.error}`)
      .join("\n"),
  };
}

export async function runSiteUpgradeManager({
  config,
  siteBaseUrl,
  cronSecret,
  fetchImpl = fetch,
}) {
  if (!config.enabled) {
    return { ok: false, skipped: true, reason: "disabled", actions: [] };
  }
  if (!cronSecret) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_cron_secret",
      actions: [],
    };
  }

  const targets = [
    {
      name: "indexnow-submit-recent",
      path: "/api/indexnow-submit-recent",
    },
    {
      name: "policy-url-check",
      path: "/api/cron/policy-url-check",
    },
    {
      name: "policy-ai-guide-backfill",
      path: "/api/cron/policy-ai-guide-backfill",
    },
    {
      name: "news-ai-commentary-backfill",
      path: "/api/cron/news-ai-commentary-backfill",
    },
  ];

  const actions = [];
  for (const target of targets) {
    actions.push(
      await callCron({
        name: target.name,
        url: `${siteBaseUrl}${target.path}`,
        cronSecret,
        fetchImpl,
      }),
    );
  }

  return {
    ok: actions.every((action) => action.ok),
    skipped: false,
    actions,
  };
}

async function callCron({ name, url, cronSecret, fetchImpl }) {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const text = await response.text().catch(() => "");
    return {
      name,
      ok: response.ok,
      status: response.status,
      body: text.slice(0, 500),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
