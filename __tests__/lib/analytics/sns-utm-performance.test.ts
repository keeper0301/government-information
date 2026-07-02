import { describe, expect, it } from "vitest";
import {
  buildLeadRecommendations,
  buildSnsExperimentDigest,
  parseSnsUtmPerformanceRows,
  summarizeSnsUtmPerformance,
} from "@/lib/analytics/sns-utm-performance";

describe("sns UTM performance", () => {
  it("GA4 rows에서 blog_auto SNS UTM만 집계하고 세션순으로 정렬한다", () => {
    const rows = parseSnsUtmPerformanceRows({
      rows: [
        {
          dimensionValues: [
            { value: "threads" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "lead_1" },
          ],
          metricValues: [{ value: "7" }, { value: "5" }],
        },
        {
          dimensionValues: [
            { value: "threads" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "lead_1" },
          ],
          metricValues: [{ value: "3" }, { value: "2" }],
        },
        {
          dimensionValues: [
            { value: "twitter" },
            { value: "social" },
            { value: "blog_auto" },
            { value: "link" },
          ],
          metricValues: [{ value: "4" }, { value: "4" }],
        },
        {
          dimensionValues: [
            { value: "threads" },
            { value: "referral" },
            { value: "blog_auto" },
            { value: "lead_0" },
          ],
          metricValues: [{ value: "99" }, { value: "99" }],
        },
      ],
    });

    expect(rows).toEqual([
      { source: "threads", content: "lead_1", sessions: 10, activeUsers: 7 },
      { source: "twitter", content: "link", sessions: 4, activeUsers: 4 },
    ]);
  });

  it("요약에서 전체 세션과 현재 1등 lead를 낸다", () => {
    const summary = summarizeSnsUtmPerformance(
      [
        { source: "threads", content: "lead_2", sessions: 6, activeUsers: 5 },
        { source: "facebook", content: "link", sessions: 2, activeUsers: 2 },
      ],
      30,
    );

    expect(summary.ready).toBe(true);
    expect(summary.totals).toEqual({ sessions: 8, activeUsers: 7 });
    expect(summary.bestContent?.content).toBe("lead_2");
  });

  it("GA4 오류가 있으면 ready=false로 콘솔을 깨지 않는다", () => {
    const summary = summarizeSnsUtmPerformance([], 30, "GA4 credentials missing");
    expect(summary.ready).toBe(false);
    expect(summary.error).toContain("GA4 credentials missing");
  });

  it("Threads lead별 유지/중단/관찰 권고를 계산한다", () => {
    const recommendations = buildLeadRecommendations([
      { source: "threads", content: "lead_1", sessions: 14, activeUsers: 10 },
      { source: "threads", content: "lead_0", sessions: 5, activeUsers: 4 },
      { source: "threads", content: "lead_2", sessions: 1, activeUsers: 1 },
      { source: "twitter", content: "link", sessions: 99, activeUsers: 90 },
    ]);

    expect(recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: "lead_0",
        status: "watch",
        sharePct: 25,
        pauseImpact: expect.objectContaining({ lostSessions: 5, riskLabel: "중간" }),
      }),
      expect.objectContaining({
        content: "lead_1",
        status: "keep",
        sharePct: 70,
        pauseImpact: expect.objectContaining({ lostSessions: 14, lostActiveUsers: 10, riskLabel: "높음" }),
      }),
      expect.objectContaining({
        content: "lead_2",
        status: "pause",
        sharePct: 5,
        pauseImpact: expect.objectContaining({ lostSessions: 1, remainingLeadCount: 5, riskLabel: "중간" }),
      }),
      expect.objectContaining({
        content: "lead_3",
        status: "pause",
        sharePct: 0,
        pauseImpact: expect.objectContaining({ lostSessions: 0, remainingLeadCount: 5, riskLabel: "낮음" }),
      }),
    ]));
    expect(recommendations).toHaveLength(6);
  });

  it("표본이 부족하면 lead를 섣불리 죽이지 않는다", () => {
    const recommendations = buildLeadRecommendations([
      { source: "threads", content: "lead_1", sessions: 3, activeUsers: 3 },
    ]);

    expect(recommendations.every((row) => row.status === "needs_data")).toBe(true);
  });

  it("challenger lead는 30세션 이후 core 평균 대비 확대/중단 종료 조건을 낸다", () => {
    const recommendations = buildLeadRecommendations([
      { source: "threads", content: "lead_0", sessions: 40, activeUsers: 34 },
      { source: "threads", content: "lead_1", sessions: 50, activeUsers: 42 },
      { source: "threads", content: "lead_2", sessions: 60, activeUsers: 49 },
      { source: "threads", content: "lead_3", sessions: 65, activeUsers: 56 },
      { source: "threads", content: "lead_4", sessions: 30, activeUsers: 25 },
      { source: "threads", content: "lead_5", sessions: 29, activeUsers: 23 },
    ]);

    expect(recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: "lead_0",
        experiment: expect.objectContaining({ action: "baseline", label: "기준군", coreAverageSessions: 50 }),
      }),
      expect.objectContaining({
        content: "lead_3",
        experiment: expect.objectContaining({ action: "expand", label: "확대 후보", coreAverageSessions: 50 }),
      }),
      expect.objectContaining({
        content: "lead_4",
        experiment: expect.objectContaining({ action: "pause", label: "중단 후보", coreAverageSessions: 50 }),
      }),
      expect.objectContaining({
        content: "lead_5",
        experiment: expect.objectContaining({ action: "needs_data", label: "표본 부족", coreAverageSessions: 50 }),
      }),
    ]));
  });

  it("SNS 실험 요약은 확대/중단 후보와 현재 cap을 텔레그램용 문장으로 압축한다", () => {
    const summary = summarizeSnsUtmPerformance(
      [
        { source: "threads", content: "lead_0", sessions: 40, activeUsers: 34 },
        { source: "threads", content: "lead_1", sessions: 50, activeUsers: 42 },
        { source: "threads", content: "lead_2", sessions: 60, activeUsers: 49 },
        { source: "threads", content: "lead_3", sessions: 65, activeUsers: 56 },
        { source: "threads", content: "lead_4", sessions: 30, activeUsers: 25 },
        { source: "threads", content: "lead_5", sessions: 29, activeUsers: 23 },
      ],
      30,
    );

    const digest = buildSnsExperimentDigest(summary, {
      challengerTrafficPct: 35,
      disabledLeadVariants: ["lead_5"],
      warning: null,
    });

    expect(digest.severity).toBe("action");
    expect(digest.expansionCandidateCount).toBe(1);
    expect(digest.pauseCandidateCount).toBe(1);
    expect(digest.subject).toContain("실험 조치 후보 2건");
    expect(digest.message).toContain("현재 challenger 상한: 35%");
    expect(digest.message).toContain("확대 후보: lead_3(65)");
    expect(digest.message).toContain("중단 후보: lead_4(30)");
  });

  it("challenger가 모두 중단 중이면 표본 부족이 아니라 표본 차단으로 알린다", () => {
    const summary = summarizeSnsUtmPerformance(
      [
        { source: "threads", content: "lead_1", sessions: 42, activeUsers: 41 },
        { source: "threads", content: "lead_0", sessions: 30, activeUsers: 29 },
        { source: "threads", content: "lead_2", sessions: 28, activeUsers: 27 },
      ],
      30,
    );
    const digest = buildSnsExperimentDigest(summary, {
      challengerTrafficPct: 20,
      disabledLeadVariants: ["lead_3", "lead_4", "lead_5"],
      warning: null,
    });

    expect(digest.severity).toBe("action");
    expect(digest.subject).toContain("challenger 표본 차단");
    expect(digest.message).toContain("활성 lead 3/6");
    expect(digest.message).toContain("표본 차단: challenger lead_3, lead_4, lead_5");
    expect(digest.message).toContain("후보 1개만 '사용' 승인");
  });

  it("GA4 오류 요약은 blocked로 보내고 정책 변경 판단을 막는다", () => {
    const summary = summarizeSnsUtmPerformance([], 30, "GA4 credentials missing");
    const digest = buildSnsExperimentDigest(summary, {
      challengerTrafficPct: 20,
      disabledLeadVariants: ["lead_3", "lead_4", "lead_5"],
      warning: null,
    });

    expect(digest.severity).toBe("blocked");
    expect(digest.subject).toContain("성과 조회 대기");
    expect(digest.message).toContain("GA4 credentials missing");
  });
});
