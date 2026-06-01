const DEFAULT_BLOG_MANAGER_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BACKUP_PUBLISH_GAP_MS = 12 * 60 * 60 * 1000;

export function readBlogManagerConfig(env = process.env) {
  return {
    enabled: env.BLOG_MANAGER_ENABLED !== "false",
    allowBackupPublish: env.BLOG_MANAGER_ALLOW_BACKUP_PUBLISH !== "false",
    intervalMs: Math.max(
      15 * 60 * 1000,
      Number(env.BLOG_MANAGER_INTERVAL_MS || DEFAULT_BLOG_MANAGER_INTERVAL_MS),
    ),
    backupPublishGapMs: Math.max(
      60 * 60 * 1000,
      Number(
        env.BLOG_MANAGER_BACKUP_PUBLISH_GAP_MS ||
          DEFAULT_BACKUP_PUBLISH_GAP_MS,
      ),
    ),
  };
}

export function shouldRunBlogManager({ nowMs, lastRunAt, intervalMs }) {
  if (!lastRunAt) return true;
  return nowMs - Date.parse(lastRunAt) >= intervalMs;
}

export function needsBackupPublish(cycle) {
  const recommendations = Array.isArray(cycle?.body?.recommendations)
    ? cycle.body.recommendations
    : Array.isArray(cycle?.recommendations)
      ? cycle.recommendations
      : [];
  return recommendations.some((item) => {
    return item?.operation?.action === "codex_blog_publish_fix";
  });
}

export function buildBlogManagerAlert(result) {
  if (!result.ok) {
    return {
      subject: "[keepioo 블로그 관리] 자동 관리 실패",
      message: JSON.stringify(result).slice(0, 1500),
    };
  }
  const failed = result.actions.filter((action) => !action.ok);
  if (failed.length === 0) return null;
  return {
    subject: `[keepioo 블로그 관리] ${failed.length}건 실패`,
    message: failed
      .map((action) => `- ${action.name}: ${action.status ?? action.error}`)
      .join("\n"),
  };
}

export async function runBlogManager({
  config,
  siteBaseUrl,
  cronSecret,
  cycle,
  lastBackupPublishAt,
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

  const actions = [];
  actions.push(
    await callCron({
      name: "blog-quality-check",
      url: `${siteBaseUrl}/api/cron/blog-quality-check`,
      cronSecret,
      fetchImpl,
    }),
  );
  actions.push(
    await callCron({
      name: "sns-publish-blog",
      url: `${siteBaseUrl}/api/cron/sns-publish-blog`,
      cronSecret,
      fetchImpl,
    }),
  );

  const backupNeeded = needsBackupPublish(cycle);
  const backupGapPassed =
    !lastBackupPublishAt ||
    Date.now() - Date.parse(lastBackupPublishAt) >= config.backupPublishGapMs;

  if (config.allowBackupPublish && backupNeeded && backupGapPassed) {
    actions.push(
      await callCron({
        name: "publish-blog-backup",
        url: `${siteBaseUrl}/api/publish-blog?count=1`,
        cronSecret,
        method: "GET",
        fetchImpl,
      }),
    );
  }

  return {
    ok: actions.every((action) => action.ok),
    skipped: false,
    backupNeeded,
    backupAttempted: actions.some(
      (action) => action.name === "publish-blog-backup",
    ),
    actions,
  };
}

async function callCron({
  name,
  url,
  cronSecret,
  method = "POST",
  fetchImpl,
}) {
  try {
    const response = await fetchImpl(url, {
      method,
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
