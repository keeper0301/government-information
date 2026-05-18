import { describe, expect, it } from "vitest";
import { buildSummaryMessage } from "@/lib/blog-publish-summary";

describe("buildSummaryMessage", () => {
  it("정상 발행 (7건) — subject + 마지막 발행 시각 포함", () => {
    const r = buildSummaryMessage({
      publishedCount: 7,
      successAttempts: 7,
      failedAttempts: 0,
      lastPublishedAt: "2026-05-19T07:10:00+09:00",
      avgBodyChars: 1950,
    });
    expect(r.subject).toContain("7건 발행");
    expect(r.subject).not.toContain("⚠️");
    expect(r.message).toContain("정상 발행");
    expect(r.message).toContain("성공 7");
    expect(r.message).toContain("본문 평균: 1950자");
  });

  it("본문 짧음 사고 의심 (avgBodyChars < 1700) — subject 에 ⚠️ + 의심 원인", () => {
    const r = buildSummaryMessage({
      publishedCount: 7,
      successAttempts: 7,
      failedAttempts: 0,
      lastPublishedAt: "2026-05-19T07:10:00+09:00",
      avgBodyChars: 800, // 5/18 OpenAI 사고 패턴 (591~859자)
    });
    expect(r.subject).toContain("본문 짧음 ⚠️");
    expect(r.message).toContain("본문 평균: 800자");
    expect(r.message).toContain("LLM dysfunction 의심");
    expect(r.message).toContain("lib/ai.ts");
    expect(r.message).toContain("keepioo-blog-revert-2026-05-18");
  });

  it("일부 실패 (5/7) — subject 는 발행된 5건 강조, 본문에 실패 2건 명시", () => {
    const r = buildSummaryMessage({
      publishedCount: 5,
      successAttempts: 5,
      failedAttempts: 2,
      lastPublishedAt: "2026-05-19T07:05:00+09:00",
    });
    expect(r.subject).toContain("5건 발행");
    expect(r.message).toContain("성공 5");
    expect(r.message).toContain("실패 2");
  });

  it("발행 0건 (5/18 OpenAI 사고 패턴) — 사고 의심 메시지 + 3 원인 가이드", () => {
    const r = buildSummaryMessage({
      publishedCount: 0,
      successAttempts: 0,
      failedAttempts: 14,
      lastPublishedAt: null,
    });
    expect(r.subject).toContain("0건");
    expect(r.subject).toContain("⚠️");
    expect(r.message).toContain("Gemini quota");
    expect(r.message).toContain("sparse 가드");
    expect(r.message).toContain("GitHub Actions");
  });

  it("본문 너무 김 사고 (avgBodyChars > 2,800자) — AI 잡담 신호 + MAX_CONTENT_LENGTH 가드 안내", () => {
    const r = buildSummaryMessage({
      publishedCount: 7,
      successAttempts: 7,
      failedAttempts: 0,
      lastPublishedAt: "2026-05-19T07:10:00+09:00",
      avgBodyChars: 2950, // 정상 ~1,950 대비 너무 김
    });
    expect(r.subject).toContain("본문 김 ⚠️");
    expect(r.message).toContain("본문 평균: 2950자");
    expect(r.message).toContain("AI 잡담");
    expect(r.message).toContain("MAX_CONTENT_LENGTH=3000");
  });

  it("본문 평균 정상 범위 (1,700~2,800자) — 양면 anomaly 모두 미발동", () => {
    const r1 = buildSummaryMessage({
      publishedCount: 7,
      successAttempts: 7,
      failedAttempts: 0,
      lastPublishedAt: "2026-05-19T07:10:00+09:00",
      avgBodyChars: 1700, // 하한 경계
    });
    const r2 = buildSummaryMessage({
      publishedCount: 7,
      successAttempts: 7,
      failedAttempts: 0,
      lastPublishedAt: "2026-05-19T07:10:00+09:00",
      avgBodyChars: 2800, // 상한 경계
    });
    expect(r1.subject).not.toContain("⚠️");
    expect(r2.subject).not.toContain("⚠️");
  });

  it("발행 0건 + cron 노쇼 (success+failed=0)", () => {
    const r = buildSummaryMessage({
      publishedCount: 0,
      successAttempts: 0,
      failedAttempts: 0,
      lastPublishedAt: null,
    });
    expect(r.subject).toContain("0건");
    expect(r.message).toContain("0회");
  });
});
