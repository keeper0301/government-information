export function buildSummaryMessage(input: {
  publishedCount: number;
  successAttempts: number;
  failedAttempts: number;
  lastPublishedAt: string | null;
}): { subject: string; message: string } {
  const { publishedCount, successAttempts, failedAttempts, lastPublishedAt } = input;

  if (publishedCount === 0) {
    return {
      subject: "[keepioo] 블로그 24h 발행 0건 ⚠️",
      message: [
        `24h 블로그 발행 0건 감지.`,
        `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
        ``,
        `[의심 원인]`,
        `1. Gemini quota (RESOURCE_EXHAUSTED) — https://aistudio.google.com/spend`,
        `2. sparse 가드 차단 ("본문이 너무 짧음") — admin_actions.blog_publish_run details 확인`,
        `3. GitHub Actions cron 노쇼 — https://github.com/keeper0301/government-information/actions`,
      ].join("\n"),
    };
  }

  return {
    subject: `[keepioo] 블로그 ${publishedCount}건 발행`,
    message: [
      `24h 블로그 ${publishedCount}건 정상 발행.`,
      `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
      lastPublishedAt
        ? `마지막 발행: ${new Date(lastPublishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
        : null,
    ].filter(Boolean).join("\n"),
  };
}
