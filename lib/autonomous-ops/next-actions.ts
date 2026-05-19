import type { BlogPublishStats } from "@/lib/analytics/blog-publish-stats";
import type { KeepioAgentStatus } from "@/lib/analytics/keepio-agent-status";
import type { PendingExternalAction } from "@/lib/autonomous-ops/pending-external-actions";
import type { LearningLoopSnapshot } from "@/lib/autonomous-ops/learning-loop";
import type { W1ReadinessResult } from "@/lib/codex/w1-readiness";
import type { AdsenseMetricsLatest } from "@/lib/monitoring/adsense-revenue-trend";
import type { ExternalConsoleMetrics } from "@/lib/monitoring/external-console-kpis";
import type { ScMetricsLatest } from "@/lib/monitoring/sc-metrics-trend";

export const DIAGNOSE_QUESTION_COUNT = 10;

export type OpsNextActionSeverity = "action_required" | "watch" | "normal";

export type OpsNextAction = {
  severity: OpsNextActionSeverity;
  title: string;
  detail: string;
  recommendation: string;
  source: string;
};

export type DiagnoseCoverageSummary = {
  expectedQuestions: number;
  observedQuestions: number;
  status: OpsNextActionSeverity;
  label: string;
};

export type AdsenseOnboardingStepStatus = "done" | "watch" | "action_required";

export type AdsenseOnboardingStep = {
  label: string;
  status: AdsenseOnboardingStepStatus;
  detail: string;
};

export type AdsenseOnboardingSummary = {
  active: boolean;
  dayLabel: string;
  headline: string;
  steps: AdsenseOnboardingStep[];
};

export type BuildOpsNextActionsInput = {
  pendingExternalActions: PendingExternalAction[];
  adsenseMetrics: AdsenseMetricsLatest | null;
  scMetrics: ScMetricsLatest | null;
  blogPublishStats: BlogPublishStats;
  keepioAgentStatus: KeepioAgentStatus;
  learningLoop: LearningLoopSnapshot;
  codexW1: W1ReadinessResult;
  externalMetrics: ExternalConsoleMetrics;
};

const SEVERITY_RANK: Record<OpsNextActionSeverity, number> = {
  action_required: 0,
  watch: 1,
  normal: 2,
};

export function buildDiagnoseCoverageSummary(
  readiness: W1ReadinessResult,
): DiagnoseCoverageSummary {
  const observedQuestions = readiness.uniqueQuestions;
  const status: OpsNextActionSeverity =
    observedQuestions >= DIAGNOSE_QUESTION_COUNT
      ? "normal"
      : readiness.windowReached
        ? "action_required"
        : "watch";

  return {
    expectedQuestions: DIAGNOSE_QUESTION_COUNT,
    observedQuestions,
    status,
    label: `${observedQuestions}/${DIAGNOSE_QUESTION_COUNT} question`,
  };
}

export function buildAdsenseOnboardingSummary(
  adsenseMetrics: AdsenseMetricsLatest | null,
  scMetrics: ScMetricsLatest | null,
): AdsenseOnboardingSummary {
  if (!adsenseMetrics || adsenseMetrics.impressions === null) {
    return {
      active: false,
      dayLabel: "대기",
      headline: "AdSense 성능 데이터 대기",
      steps: [],
    };
  }

  const readyHours = adsenseMetrics.readySinceHours;
  const day = readyHours === null ? null : Math.floor(readyHours / 24) + 1;
  const adRequests = adsenseMetrics.adRequests ?? 0;
  const impressions = adsenseMetrics.impressions ?? 0;
  const clicks = adsenseMetrics.clicks ?? 0;
  const scImpressions = scMetrics?.impressions ?? 0;
  const scClicks = scMetrics?.clicks ?? 0;

  const afterHours = (hours: number) => readyHours !== null && readyHours >= hours;

  return {
    active: true,
    dayLabel: day === null ? "READY" : `D+${Math.min(7, day)}`,
    headline:
      readyHours !== null && readyHours < 24
        ? "통과 직후 grace period"
        : "AdSense 첫 7일 성장 점검",
    steps: [
      {
        label: "D+0 광고 코드/env",
        status: "done",
        detail: "external-console-check 에서 AdSense KPI row 확인됨",
      },
      {
        label: "D+1 광고 요청",
        status:
          adRequests > 0 || impressions > 0
            ? "done"
            : afterHours(24)
              ? "action_required"
              : "watch",
        detail:
          adRequests > 0
            ? `요청 ${adRequests.toLocaleString()}건`
            : "24h 뒤에도 0이면 env, slot, ads.txt 확인",
      },
      {
        label: "D+1 노출",
        status:
          impressions > 0 ? "done" : afterHours(24) ? "action_required" : "watch",
        detail:
          impressions > 0
            ? `노출 ${impressions.toLocaleString()}회`
            : "Mediapartners-Google crawl 또는 광고 코드 지연 가능",
      },
      {
        label: "D+2 검색 노출",
        status:
          scImpressions > 0
            ? "done"
            : afterHours(48)
              ? "watch"
              : "watch",
        detail:
          scImpressions > 0
            ? `Search Console 노출 ${scImpressions.toLocaleString()}회`
            : "Search Console lag 1~2일 정상 범위",
      },
      {
        label: "D+3 클릭",
        status: clicks > 0 || scClicks > 0 ? "done" : afterHours(72) ? "watch" : "watch",
        detail:
          clicks > 0 || scClicks > 0
            ? `광고 클릭 ${clicks.toLocaleString()} · 검색 클릭 ${scClicks.toLocaleString()}`
            : "노출은 있는데 클릭 0이면 title/meta 개선 후보",
      },
      {
        label: "D+7 수익 추세",
        status:
          adsenseMetrics.earnings > 0
            ? "done"
            : afterHours(7 * 24)
              ? "watch"
              : "watch",
        detail:
          adsenseMetrics.earnings > 0
            ? `${adsenseMetrics.currency} ${adsenseMetrics.earnings.toFixed(2)}`
            : "7일 누적 후 RPM·CTR 기준선 설정",
      },
    ],
  };
}

export function buildOpsNextActions(
  input: BuildOpsNextActionsInput,
): OpsNextAction[] {
  const actions: OpsNextAction[] = [];
  const firstExternal = input.pendingExternalActions[0];
  if (firstExternal) {
    actions.push({
      severity: "action_required",
      title: `외부 액션 ${input.pendingExternalActions.length}건 남음`,
      detail: `${firstExternal.label}: ${firstExternal.description}`,
      recommendation: firstExternal.guideUrl
        ? `가이드 확인 후 ${firstExternal.estimatedMinutes}분 안에 처리`
        : `${firstExternal.estimatedMinutes}분 액션`,
      source: "pending_external_actions",
    });
  }

  const adsense = input.adsenseMetrics;
  if (adsense?.impressions !== null && adsense?.impressions !== undefined) {
    const readyHours = adsense.readySinceHours;
    const adRequests = adsense.adRequests ?? 0;
    if (
      readyHours !== null &&
      readyHours >= 24 &&
      adsense.impressions === 0 &&
      adRequests === 0
    ) {
      actions.push({
        severity: "action_required",
        title: "AdSense 요청·노출 0",
        detail: `READY 후 ${readyHours}h 지났지만 광고 요청과 노출이 모두 0입니다.`,
        recommendation: "NEXT_PUBLIC_ADSENSE_ID, 광고 slot, ads.txt, robots allow 확인",
        source: "adsense",
      });
    } else if (readyHours === null && adsense.impressions === 0 && adRequests === 0) {
      actions.push({
        severity: "watch",
        title: "AdSense READY 시간 미확정",
        detail: "광고 KPI row는 있지만 READY 후 경과 시간이 아직 계산되지 않았습니다.",
        recommendation: "adsense_review_state READY audit 누적 후 24h 기준으로 요청·노출을 재판정",
        source: "adsense",
      });
    } else if (readyHours !== null && readyHours < 24) {
      actions.push({
        severity: "watch",
        title: "AdSense grace period",
        detail: `READY 후 ${readyHours}h. 첫 광고 채움까지 1~24h 지연 가능성이 있습니다.`,
        recommendation: "24h 뒤 요청·노출이 0이면 광고 코드와 ads.txt를 점검",
        source: "adsense",
      });
    } else if (adsense.earnings === 0) {
      actions.push({
        severity: "watch",
        title: "AdSense 수익 0",
        detail: `노출 ${adsense.impressions.toLocaleString()} · 클릭 ${(adsense.clicks ?? 0).toLocaleString()}`,
        recommendation: "7일 누적 후 CTR/RPM 기준선을 보고 콘텐츠·광고 위치 조정",
        source: "adsense",
      });
    }
  }

  if (input.scMetrics && input.scMetrics.impressions === 0 && input.scMetrics.clicks === 0) {
    actions.push({
      severity: "watch",
      title: "Search Console 노출 0",
      detail: "최근 3일 검색 노출·클릭이 없습니다.",
      recommendation: "색인 상태, robots, sitemap, 주요 글 title/meta를 점검",
      source: "search_console",
    });
  }

  if (input.blogPublishStats.status === "stalled") {
    actions.push({
      severity: "action_required",
      title: "블로그 발행 정지",
      detail: `마지막 발행 후 ${input.blogPublishStats.hoursSinceLastPublish}h 경과`,
      recommendation: "publish-blog workflow, Gemini quota, blog body 품질 로그 확인",
      source: "blog_publish",
    });
  } else if (
    input.blogPublishStats.status === "watch" ||
    input.blogPublishStats.bodyStatus === "anomaly"
  ) {
    actions.push({
      severity: "watch",
      title: "블로그 발행 품질 관찰",
      detail: `status=${input.blogPublishStats.status}, body=${input.blogPublishStats.bodyStatus}`,
      recommendation: "최근 발행 본문 길이와 quality gate 로그 확인",
      source: "blog_publish",
    });
  }

  if (!input.keepioAgentStatus.ready) {
    actions.push({
      severity: input.keepioAgentStatus.configured ? "watch" : "action_required",
      title: "Keepio Agent 연결 점검",
      detail: input.keepioAgentStatus.error ?? "health URL 미설정",
      recommendation: "KEEPIO_AGENT_HEALTH_URL 및 sidecar health endpoint 확인",
      source: "keepio_agent",
    });
  }

  if (input.learningLoop.criticalAnomalyCount > 0 || input.learningLoop.healthScore < 55) {
    actions.push({
      severity: "action_required",
      title: "Resident loop 위험 신호",
      detail: `health ${input.learningLoop.healthScore}/100 · critical ${input.learningLoop.criticalAnomalyCount}`,
      recommendation: "Learning loop anomaly 상위 항목부터 확인",
      source: "learning_loop",
    });
  } else if (input.learningLoop.healthScore < 80) {
    actions.push({
      severity: "watch",
      title: "Resident loop 관찰 필요",
      detail: `health ${input.learningLoop.healthScore}/100`,
      recommendation: "자동 개선 후보와 source heartbeat를 확인",
      source: "learning_loop",
    });
  }

  if (input.codexW1.windowReached && input.codexW1.ready) {
    actions.push({
      severity: "action_required",
      title: "Codex W1 활성화 가능",
      detail: `7일 ${input.codexW1.totalRuns7d}건 · unique ${input.codexW1.uniqueQuestions}`,
      recommendation: "GitHub PAT 발급 후 AGENT_W1_ENABLED=true 등록",
      source: "codex_w1",
    });
  } else if (input.codexW1.windowReached && !input.codexW1.ready) {
    actions.push({
      severity: "watch",
      title: "Codex W1 임계 미달",
      detail: input.codexW1.reasons.join(" / ") || "임계 미달",
      recommendation: "W0 cron 가동 상태와 diagnose question coverage 확인",
      source: "codex_w1",
    });
  }

  const vercel = input.externalMetrics.vercel;
  if (vercel && vercel.failed24h > 0) {
    actions.push({
      severity: vercel.failureRate >= 0.2 ? "action_required" : "watch",
      title: "Vercel 배포 실패",
      detail: `24h 실패 ${vercel.failed24h}/${vercel.total24h}`,
      recommendation: "최근 deployment log와 failed uid 확인",
      source: "vercel",
    });
  }
  const supabase = input.externalMetrics.supabase;
  if (supabase && supabase.advisorError > 0) {
    actions.push({
      severity: "action_required",
      title: "Supabase advisor error",
      detail: `error ${supabase.advisorError} · warn ${supabase.advisorWarn}`,
      recommendation: "advisor error 항목부터 확인하고 RLS/성능 위험 분리",
      source: "supabase",
    });
  }

  if (actions.length === 0) {
    return [
      {
        severity: "normal",
        title: "오늘 즉시 조치 없음",
        detail: "핵심 운영 신호가 정상 범위입니다.",
        recommendation: "AdSense 7일 추세와 resident loop 후보만 관찰",
        source: "summary",
      },
    ];
  }

  return actions
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 5);
}
