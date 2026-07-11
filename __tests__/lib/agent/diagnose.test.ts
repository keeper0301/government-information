import { describe, expect, it, vi } from "vitest";

// Supabase admin mock — 모든 query 빈 결과 (단위 테스트는 handler 분기만 검증)
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => makeChain(),
  }),
}));

// 모든 chain 메서드 self-return → resolve to { data: [], count: 0 }
function makeChain(): unknown {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "lt", "like", "order", "limit"];
  for (const m of methods) chain[m] = () => chain;
  // terminal
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: [], count: 0 });
  return chain;
}

vi.mock("@/lib/analytics/gemini-spending", () => ({
  GEMINI_KEEPIOO_CAP_KRW: 30000,
  getGeminiSpendingStats: async () => ({
    windowDays: 28,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostKrw: 0,
    monthlyProjectionKrw: 0,
  }),
}));

vi.mock("@/lib/analytics/blog-publish-stats", () => ({
  getBlogPublishStats: async () => ({
    published24h: 1,
    published7d: 7,
    lastPublishedAt: "2026-05-18T00:00:00.000Z",
    hoursSinceLastPublish: 3,
    status: "healthy",
  }),
}));

import {
  classifyCronFailureError,
  isSuppressedCronFailure,
  listDiagnoseQuestions,
  runDiagnose,
  summarizeCronFailures,
} from "@/lib/agent/diagnose";

describe("listDiagnoseQuestions", () => {
  it("11 question id 노출 (사전 정의)", () => {
    const list = listDiagnoseQuestions();
    expect(list).toHaveLength(11);
    expect(list).toContain("health_overview");
    expect(list).toContain("cron_recent_24h");
    expect(list).toContain("news_freshness");
    expect(list).toContain("press_tier_status");
    expect(list).toContain("llm_spending_28d");
    expect(list).toContain("blog_publish_status");
    expect(list).toContain("sms_delivery_24h");
    expect(list).toContain("agent_recent_actions");
    expect(list).toContain("alert_recent_24h");
    expect(list).toContain("db_table_sizes");
    expect(list).toContain("local_press_collector_health");
  });
});

describe("runDiagnose", () => {
  it("unknown question → throw", async () => {
    // @ts-expect-error 의도된 잘못된 input
    await expect(runDiagnose("unknown_xyz")).rejects.toThrow(/unknown diagnose question/);
  });

  it("정상 question → { question, data, collected_at } 반환", async () => {
    const r = await runDiagnose("health_overview");
    expect(r.question).toBe("health_overview");
    expect(r.data).toBeDefined();
    expect(r.collected_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("llm_spending_28d → cap_krw + ratio 포함 (G4 spec reuse)", async () => {
    const r = await runDiagnose("llm_spending_28d");
    const data = r.data as { cap_krw: number; ratio: number };
    expect(data.cap_krw).toBe(30000);
    expect(data.ratio).toBe(0);
  });

  it("blog_publish_status → 작성/발행 상태를 반환한다", async () => {
    const r = await runDiagnose("blog_publish_status");
    const data = r.data as { status: string; published24h: number };
    expect(data.status).toBe("healthy");
    expect(data.published24h).toBe(1);
  });

  it("cron 실패 목록을 원인 분류와 함께 요약한다", () => {
    expect(classifyCronFailureError("HTTP 429 Too Many Requests")).toBe("rate_limit");
    expect(classifyCronFailureError("AbortError: timed out")).toBe("timeout");
    expect(classifyCronFailureError("HTTP 401 unauthorized")).toBe("auth");

    const summary = summarizeCronFailures([
      {
        job_name: "press-ingest",
        occurrences: 3,
        last_seen_at: "2026-07-10T12:00:00.000Z",
        error_message: "AbortError: timed out",
      },
      {
        job_name: "env-health",
        occurrences: 1,
        last_seen_at: "2026-07-10T12:05:00.000Z",
        error_message: "HTTP 401 unauthorized",
      },
    ]);

    expect(summary.totalOccurrences).toBe(4);
    expect(summary.suppressedOccurrences).toBe(0);
    expect(summary.byErrorClass).toEqual({ timeout: 1, auth: 1 });
    expect(summary.byJobName).toEqual({ "press-ingest": 1, "env-health": 1 });
    expect(summary.recent[0]).toMatchObject({
      jobName: "press-ingest",
      occurrences: 3,
      errorClass: "timeout",
    });
  });

  it("중단된 korea.kr RSS 실패는 active cron failure 에서 제외하고 suppressed 로 노출한다", () => {
    const row = {
      job_name: "collect-news (cron) - korea.kr RSS 수집 이슈",
      occurrences: 10,
      last_seen_at: "2026-07-11T02:00:00.000Z",
      error_message: "errors=10 / total=0 (실패율 100%)",
    };

    expect(isSuppressedCronFailure(row)).toContain("RSS service discontinued");

    const summary = summarizeCronFailures([
      row,
      {
        job_name: "press-ingest",
        occurrences: 2,
        last_seen_at: "2026-07-11T02:05:00.000Z",
        error_message: "AbortError: timed out",
      },
    ]);

    expect(summary.recent).toHaveLength(1);
    expect(summary.recent[0]?.jobName).toBe("press-ingest");
    expect(summary.suppressedRecent).toHaveLength(1);
    expect(summary.suppressedRecent[0]).toMatchObject({
      jobName: "collect-news (cron) - korea.kr RSS 수집 이슈",
      occurrences: 10,
      suppressedReason: expect.stringContaining("RSS service discontinued"),
    });
    expect(summary.totalOccurrences).toBe(2);
    expect(summary.suppressedOccurrences).toBe(10);
  });

  it("소진된 publish-blog 카테고리 실패도 active cron failure 에서 제외한다", () => {
    const row = {
      job_name: "publish-blog (cron)",
      occurrences: 36,
      last_seen_at: "2026-07-10T23:09:00.000Z",
      error_message:
        "[노년] 발행 가능한 정책을 못 찾았어요 (카테고리: 노년). 모든 정책이 이미 글로 발행됐거나 매칭이 없어요.",
    };

    expect(isSuppressedCronFailure(row)).toContain("category exhausted");

    const summary = summarizeCronFailures([row]);

    expect(summary.recent).toHaveLength(0);
    expect(summary.suppressedRecent).toHaveLength(1);
    expect(summary.totalOccurrences).toBe(0);
    expect(summary.suppressedOccurrences).toBe(36);
  });

  it("해결된 육아·가족 품질 가드 반복 실패도 active cron failure 에서 제외한다", () => {
    const rows = [
      {
        job_name: "publish-blog (cron)",
        occurrences: 8,
        last_seen_at: "2026-07-11T08:11:00.000Z",
        error_message:
          "[육아·가족] 본문이 너무 짧음 (549자, 최소 1000자). AdSense 정책상 발행 불가.",
      },
      {
        job_name: "publish-blog (cron)",
        occurrences: 1,
        last_seen_at: "2026-07-11T08:10:00.000Z",
        error_message:
          "[육아·가족] meta_description 길이 부적정 (94자, 권장 95~175자). SEO 검색 스니펫 잘림·저품질 위험.",
      },
    ];

    expect(isSuppressedCronFailure(rows[0])).toContain("family blog candidates exhausted");

    const summary = summarizeCronFailures(rows);

    expect(summary.recent).toHaveLength(0);
    expect(summary.suppressedRecent).toHaveLength(2);
    expect(summary.totalOccurrences).toBe(0);
    expect(summary.suppressedOccurrences).toBe(9);
  });
});
