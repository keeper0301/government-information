// 2026-05-18 OpenAI 사고 (본문 591~859자 × 26회) 학습 — 정상 본문 평균 1,950자.
// 5/18 commit fc1326e (Gemini 복귀) 후 회복. 미래 동일 사고 시 사장님 즉시 인지.
// 양면 임계 — 너무 짧으면 LLM dysfunction, 너무 길면 AI 잡담 늘리는 신호.
const NORMAL_AVG_BODY_MIN = 1700; // 정상 ~1,950자, 10% buffer 미만 = 사고 의심
const NORMAL_AVG_BODY_MAX = 2800; // 가드 한도 3,000 의 7% buffer — AI 잡담 신호

export function buildSummaryMessage(input: {
  publishedCount: number;
  successAttempts: number;
  failedAttempts: number;
  lastPublishedAt: string | null;
  /** 24h 발행글 본문 평균 길이 (HTML tag 제거 후) — 5/18 사고 학습 metric */
  avgBodyChars?: number;
  /** publish-blog cron 의도 시각 (07:07 KST) 부터 실제 첫 발행까지 분 — GitHub Actions 지연 모니터링 */
  cronDelayMinutes?: number;
}): { subject: string; message: string } {
  const { publishedCount, successAttempts, failedAttempts, lastPublishedAt, avgBodyChars, cronDelayMinutes } = input;

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

  // 본문 평균 길이 사고 의심 — 양면 임계 (짧음 + 김)
  const bodyShort = avgBodyChars !== undefined && avgBodyChars < NORMAL_AVG_BODY_MIN;
  const bodyLong = avgBodyChars !== undefined && avgBodyChars > NORMAL_AVG_BODY_MAX;
  const bodyAnomaly = bodyShort || bodyLong;
  const subject = bodyShort
    ? `[keepioo] 블로그 ${publishedCount}건 발행 — 본문 짧음 ⚠️`
    : bodyLong
      ? `[keepioo] 블로그 ${publishedCount}건 발행 — 본문 김 ⚠️`
      : `[keepioo] 블로그 ${publishedCount}건 발행`;

  // 2026-05-19 — GitHub Actions 지연 알림 (5/19 KST 07:07 의도 → 실제 08:17 = 1시간 지연 학습)
  const cronDelayed = cronDelayMinutes !== undefined && cronDelayMinutes > 30;

  return {
    subject: cronDelayed && !bodyAnomaly
      ? `${subject} (cron 지연 ${cronDelayMinutes}분)`
      : subject,
    message: [
      `24h 블로그 ${publishedCount}건 정상 발행.`,
      `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
      avgBodyChars !== undefined ? `본문 평균: ${avgBodyChars}자 (정상 1,700~2,800자)` : null,
      cronDelayMinutes !== undefined
        ? `cron 지연: ${cronDelayMinutes}분 (의도 KST 07:07)${cronDelayed ? " ⚠️" : ""}`
        : null,
      lastPublishedAt
        ? `마지막 발행: ${new Date(lastPublishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
        : null,
      bodyShort
        ? [
            ``,
            `⚠️ 본문 평균 ${avgBodyChars}자 < ${NORMAL_AVG_BODY_MIN}자 임계. LLM dysfunction 의심.`,
            `[의심 원인]`,
            `1. LLM 모델 변경 (lib/ai.ts model/maxTokens/jsonMode 확인)`,
            `2. Gemini 한도 ↓ 등 부분 응답`,
            `3. prompt 변경으로 본문 토큰 분산`,
            `[조치] 메모리 [keepioo-blog-revert-2026-05-18] 참조`,
          ].join("\n")
        : null,
      bodyLong
        ? [
            ``,
            `⚠️ 본문 평균 ${avgBodyChars}자 > ${NORMAL_AVG_BODY_MAX}자 임계. AI 잡담 늘리는 신호.`,
            `[의심 원인]`,
            `1. prompt 의 본문 길이 가이드 무력화 (예: maxTokens ↑ 변경)`,
            `2. 새 prompt 가 본문 확장 요구`,
            `[조치] lib/blog-publish.ts 의 MAX_CONTENT_LENGTH=3000 가드 차단 발생 검토`,
          ].join("\n")
        : null,
    ].filter(Boolean).join("\n"),
  };
}
