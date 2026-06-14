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
  source: "health_url",
  sourceLabel: "외부 health endpoint",
  telemetryConfigured: true,
  healthUrl: "https://example.com/health",
  checkedAt: "2026-05-19T00:00:00.000Z",
  uptimeSec: 100,
  lastRunAt: "2026-05-19T00:00:00.000Z",
  lastOkAt: "2026-05-19T00:00:03.000Z",
  lastFailureAt: null,
  lastStatus: 200,
  totalRuns: 1,
  totalFailures: 0,
  consecutiveFailures: 0,
  siteLastCheckAt: "2026-05-19T00:00:00.000Z",
  siteLastOkAt: "2026-05-19T00:00:00.000Z",
  siteLastFailureAt: null,
  siteTotalChecks: 1,
  siteTotalFailures: 0,
  siteConsecutiveFailures: 0,
  siteTelegramConfigured: true,
  aiManagerEnabled: true,
  aiManagerConfigured: true,
  aiManagerPermissionLevel: "full_safe",
  aiManagerLastRunAt: "2026-05-19T00:00:00.000Z",
  aiManagerLastOkAt: "2026-05-19T00:00:01.000Z",
  aiManagerTotalRuns: 1,
  aiManagerTotalFailures: 0,
  blogManagerEnabled: true,
  blogManagerLastRunAt: "2026-05-19T00:02:00.000Z",
  blogManagerTotalRuns: 1,
  blogManagerTotalFailures: 0,
  siteMaintenanceEnabled: true,
  siteMaintenanceLastRunAt: "2026-05-19T00:03:00.000Z",
  siteMaintenanceTotalRuns: 1,
  siteMaintenanceTotalFailures: 0,
  siteUpgradeEnabled: true,
  siteUpgradeLastRunAt: "2026-05-19T00:04:00.000Z",
  siteUpgradeTotalRuns: 1,
  siteUpgradeTotalFailures: 0,
  missingRequired: [],
  automation: {
    telegram: true,
    policyDb: true,
    contentGeneration: true,
    threadsPublishing: true,
    instagramMetrics: true,
    instagramComments: true,
  },
  automationDetails: [
    {
      key: "telegram",
      label: "텔레그램 운영 알림",
      ready: true,
      mode: "변화 감지 알림",
      safetyNote: "반복 로그 대신 행동 필요 변화만 알림",
    },
    {
      key: "policyDb",
      label: "정책 DB 읽기",
      ready: true,
      mode: "read-only 조회",
      safetyNote: "정책 DB를 읽기만 하고 원본을 변경하지 않음",
    },
    {
      key: "contentGeneration",
      label: "AI 글 생성",
      ready: true,
      mode: "초안·큐 생성",
      safetyNote: "AI 초안은 승인/품질 게이트 전까지 공개되지 않음",
    },
    {
      key: "threadsPublishing",
      label: "Threads 자동 발행",
      ready: true,
      mode: "승인됨 + safety gate + dry-run ready만",
      safetyNote: "미승인 글은 발행하지 않음",
    },
    {
      key: "instagramMetrics",
      label: "Instagram metric 수집",
      ready: true,
      mode: "읽기 전용 수집",
      safetyNote: "계정 지표 조회만 수행",
    },
    {
      key: "instagramComments",
      label: "Instagram 댓글 답글",
      ready: true,
      mode: "공개 게시 전 초안 생성",
      safetyNote: "댓글 자동 공개 게시는 차단, 답글 초안만 생성",
    },
  ],
  actionItems: [],
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

  it("READY 경과 시간이 없으면 24h 초과로 단정하지 않는다", () => {
    const adsense: AdsenseMetricsLatest = {
      earnings: 0,
      currency: "KRW",
      impressions: 0,
      clicks: 0,
      adRequests: 0,
      pageViews: 0,
      ctrPct: null,
      readySinceHours: null,
      observedAt: "2026-05-19T00:00:00.000Z",
    };

    const summary = buildAdsenseOnboardingSummary(adsense, null);

    expect(summary.dayLabel).toBe("READY");
    expect(summary.steps.find((s) => s.label === "D+1 광고 요청")?.status).toBe(
      "watch",
    );
    expect(summary.steps.find((s) => s.label === "D+1 노출")?.status).toBe(
      "watch",
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

  it("AdSense READY 경과 시간이 없으면 action_required 로 과대 판정하지 않는다", () => {
    const actions = buildOpsNextActions(
      baseInput({
        adsenseMetrics: {
          earnings: 0,
          currency: "KRW",
          impressions: 0,
          clicks: 0,
          adRequests: 0,
          pageViews: 0,
          ctrPct: null,
          readySinceHours: null,
          observedAt: "2026-05-19T00:00:00.000Z",
        },
      }),
    );

    expect(actions[0]).toMatchObject({
      severity: "watch",
      source: "adsense",
      title: "AdSense READY 시간 미확정",
    });
  });
});
