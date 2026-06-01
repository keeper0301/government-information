const DEFAULT_TIMEOUT_MS = 8000;

export const DEFAULT_PUBLIC_PATHS = [
  { path: "/", label: "홈" },
  { path: "/welfare", label: "복지 목록" },
  { path: "/loan", label: "대출 목록" },
  { path: "/news", label: "뉴스 목록" },
  { path: "/blog", label: "블로그 목록" },
];

export function parseOwnerChatIds(env = process.env) {
  const ids = new Set();
  for (const raw of [
    env.TELEGRAM_OWNER_CHAT_IDS ?? "",
    env.TELEGRAM_CHAT_ID ?? "",
  ]) {
    for (const id of raw.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  return Array.from(ids);
}

export async function checkPublicSite({
  baseUrl,
  paths = DEFAULT_PUBLIC_PATHS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(
    paths.map((target) =>
      checkOnePublicPath({
        baseUrl,
        target,
        timeoutMs,
        fetchImpl,
      }),
    ),
  );
  const failed = results.filter((result) => !result.ok);
  const slow = results.filter(
    (result) => result.ok && result.durationMs >= 5000,
  );

  return {
    ok: failed.length === 0,
    checkedAt,
    checked: results.length,
    failed: failed.length,
    slow: slow.length,
    results,
  };
}

export function buildSiteDownAlert({
  site,
  consecutiveFailures,
  baseUrl,
}) {
  if (site.ok) return null;

  const failed = site.results
    .filter((result) => !result.ok)
    .map((result) => {
      const reason = result.status ?? result.error ?? "실패";
      return `${result.label}(${reason})`;
    })
    .join(", ");

  return {
    subject: `[keepioo 상주 감시] 사이트 장애 ${consecutiveFailures}회 연속`,
    message: [
      `기준 주소: ${baseUrl}`,
      `점검 시각: ${site.checkedAt}`,
      `실패: ${site.failed}/${site.checked}`,
      `대상: ${failed}`,
      "",
      "확인 순서: Vercel 배포 상태, 함수 로그, 도메인/DNS, Supabase 연결 상태를 확인하세요.",
    ].join("\n"),
  };
}

export async function sendTelegramAlert({
  token,
  chatIds,
  subject,
  message,
  fetchImpl = fetch,
}) {
  if (!token || chatIds.length === 0) {
    return { ok: false, reason: "skipped_no_credentials" };
  }

  const text = `${subject}\n\n${message}`.slice(0, 4000);
  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`http_${response.status}: ${body}`.slice(0, 300));
        }
        return true;
      }),
    ),
  );

  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  const firstFailure = results.find((result) => result.status === "rejected");

  if (sent > 0) return { ok: true, sent, failed };

  return {
    ok: false,
    reason: "api_error",
    sent,
    failed,
    error:
      firstFailure?.status === "rejected"
        ? String(firstFailure.reason?.message ?? firstFailure.reason).slice(0, 300)
        : "unknown",
  };
}

async function checkOnePublicPath({
  baseUrl,
  target,
  timeoutMs,
  fetchImpl,
}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}${target.path}`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "keepioo-resident-monitor/1.0" },
      signal: controller.signal,
    });
    response.body?.cancel?.().catch(() => {});
    return {
      path: target.path,
      label: target.label,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path: target.path,
      label: target.label,
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
