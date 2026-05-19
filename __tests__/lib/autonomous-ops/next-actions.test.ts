import { describe, expect, it } from "vitest";
import {
  buildAdsenseOnboardingSummary,
  buildDiagnoseCoverageSummary,
  buildOpsNextActions,
  DIAGNOSE_QUESTION_COUNT,
} from "@/lib/autonomous-ops/next-actions";
import type { BlogPublishStats } from "@/lib/analytics/blog-publish-stats";
import type { KeepioAgentStatus } from "@/lib/analytics/keepio-agent-status";
import type { LearningLoopSnapshot } from "@/lib/autonomous-ops/learning-loop";
import type { W1ReadinessResult } from "@/lib/codex/w1-readiness";
import type { AdsenseMetricsLatest } from "@/lib/monitoring/adsense-revenue-trend";
import type { ExternalConsoleMetrics } from "@/lib/monitoring/external-console-kpis";

const blogHealthy: BlogPublishStats = {
  published24h: 1,
  published7d: 7,
  lastPublishedAt: "2026-05-19T00:00:00.000Z",
  hoursSinceLastPublish: 3,
  status: "healthy",
  avgBodyChars24h: 1900,
  bodyStatus: "healthy",
  dailyBodyAvg7d: [],
};

const agentReady: KeepioAgentStatus = {
  configured: true,
  ok: true,
  ready: true,
  healthUrl: "https://example.com/health",
  checkedAt: "2026-05-19T00:00:00.000Z",
  uptimeSec: 100,
  missingRequired: [],
  automation: {
    telegram: true,
    policyDb: true,
    contentGeneration: true,
    threadsPublishing: true,
    instagramMetrics: true,
    instagramComments: true,
  },
  error: null,
};

const learningHealthy = {
  healthScore: 92,
  criticalAnomalyCount: 0,
} as LearningLoopSnapshot;

const w1Base: W1ReadinessResult = {
  windowReached: false,
  totalRuns7d: 100,
  uniqueQuestions: 10,
  errorRate: 0,
  ready: false,
  reasons: [],
  daysToWindow: 6,
  progressTotalRuns: 0.125,
  progressUniqueQuestions: 1,
  progressErrorRate: 1,
  thresholds: {
    totalRuns: 800,
    uniqueQuestions: 10,
    errorRate: 0.05,
  },
};

const emptyExternal: ExternalConsoleMetrics = {
  ga4: null,
  vercel: null,
  supabase: null,
  kakao: null,
  toss: null,
  observedAt: null,
};

function baseInput(overrides: Partial<Parameters<typeof buildOpsNextActions>[0]> = {}) {
  return {
    pendingExternalActions: [],
    adsenseMetrics: null,
    scMetrics: null,
    blogPublishStats: blogHealthy,
    keepioAgentStatus: agentReady,
    learningLoop: learningHealthy,
    codexW1: w1Base,
    externalMetrics: emptyExternal,
    ...overrides,
  };
}

describe("buildDiagnoseCoverageSummary", () => {
  it("10개 질문 기준으로 coverage 를 계산", () => {
    const summary = buildDiagnoseCoverageSummary({
      ...w1Base,
      uniqueQuestions: 9,
      windowReached: true,
    });

    expect(DIAGNOSE_QUESTION_COUNT).toBe(10);
    expect(summary).toMatchObject({
      expectedQuestions: 10,
      observedQuestions: 9,
      status: "action_required",
    });
  });
});

describe("buildAdsenseOnboardingSummary", () => {
  it("READY 24h 이후 요청·노출 0이면 조치 필요 step 을 만든다", () => {
    const adsense: AdsenseMetricsLatest = {
      earnings: 0,
      currency: "KRW",
      impressions: 0,
      clicks: 0,
      adRequests: 0,
      pageViews: 0,
      ctrPct: null,
      readySinceHours: 30,
      observedAt: "2026-05-19T00:00:00.000Z",
    };

    const summary = buildAdsenseOnboardingSummary(adsense, null);

    expect(summary.active).toBe(true);
    expect(summary.dayLabel).toBe("D+2");
    expect(summary.steps.find((s) => s.label === "D+1 광고 요청")?.status).toBe(
      "action_required",
    );
    expect(summary.steps.find((s) => s.label === "D+1 노출")?.status).toBe(
      "action_required",
    );
  });
});

describe("buildOpsNextActions", () => {
  it("외부 액션을 최우선 조치로 올린다", () => {
    const actions = buildOpsNextActions(
      baseInput({
        pendingExternalActions: [
          {
            category: "oauth",
            label: "Gmail OAuth",
            description: "refresh token 필요",
            estimatedMinutes: 5,
          },
        ],
      }),
    );

    expect(actions[0]).toMatchObject({
      severity: "action_required",
      source: "pending_external_actions",
    });
  });

  it("정상 상태면 즉시 조치 없음으로 수렴", () => {
    const actions = buildOpsNextActions(baseInput());

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      severity: "normal",
      source: "summary",
    });
  });
});
