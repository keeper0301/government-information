// 2026-05-18 OpenAI 사고 (본문 591~859자 × 26회) 학습 — 정상 본문 평균 1,950자.
// 5/18 commit fc1326e (Gemini 복귀) 후 회복. 미래 동일 사고 시 사장님 즉시 인지.
const NORMAL_AVG_BODY_CHARS = 1700; // 5/18 측정 평균 1,950 — 하한 임계 (10% 안전 buffer)

export function buildSummaryMessage(input: {
  publishedCount: number;
  successAttempts: number;
  failedAttempts: number;
  lastPublishedAt: string | null;
  /** 24h 발행글 본문 평균 길이 (HTML tag 제거 후) — 5/18 사고 학습 metric */
  avgBodyChars?: number;
}): { subject: string; message: string } {
  const { publishedCount, successAttempts, failedAttempts, lastPublishedAt, avgBodyChars } = input;

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

  // 본문 평균 길이 사고 의심 — 5/18 OpenAI 사고 패턴 (정상 1,950자 vs 사고 591~859자)
  const bodyAnomaly = avgBodyChars !== undefined && avgBodyChars < NORMAL_AVG_BODY_CHARS;
  const subject = bodyAnomaly
    ? `[keepioo] 블로그 ${publishedCount}건 발행 — 본문 짧음 ⚠️`
    : `[keepioo] 블로그 ${publishedCount}건 발행`;

  return {
    subject,
    message: [
      `24h 블로그 ${publishedCount}건 정상 발행.`,
      `cron 시도 ${successAttempts + failedAttempts}회 (성공 ${successAttempts} / 실패 ${failedAttempts}).`,
      avgBodyChars !== undefined ? `본문 평균: ${avgBodyChars}자 (정상 1,900자 내외)` : null,
      lastPublishedAt
        ? `마지막 발행: ${new Date(lastPublishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
        : null,
      bodyAnomaly
        ? [
            ``,
            `⚠️ 본문 평균 ${avgBodyChars}자 < ${NORMAL_AVG_BODY_CHARS}자 임계. LLM dysfunction 의심.`,
            `[의심 원인]`,
            `1. LLM 모델 변경 (lib/ai.ts model/maxTokens/jsonMode 확인)`,
            `2. Gemini 한도 ↓ 등 부분 응답`,
            `3. prompt 변경으로 본문 토큰 분산`,
            `[조치] 메모리 [keepioo-blog-revert-2026-05-18] 참조`,
          ].join("\n")
        : null,
    ].filter(Boolean).join("\n"),
  };
}
