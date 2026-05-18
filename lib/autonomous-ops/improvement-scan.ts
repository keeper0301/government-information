// ============================================================
// 자율 개선 스캔 — 운영 신호를 개선 과제로 변환.
// ============================================================
// 목표:
//  - 기존 audit/admin 테이블을 읽어 "무엇을 개선해야 하는지" 매일 자동 도출
//  - 위험한 자동 수정은 하지 않고, admin_actions 에 근거와 권장 액션을 남김
//  - /admin/autonomous 와 weekly/daily 운영 루틴에서 추적 가능한 신호 제공
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getRecentQualityImprovementHints } from "@/lib/blog/quality-learning";
import { getBlogPublishStats } from "@/lib/analytics/blog-publish-stats";
import { getPendingExternalActions } from "@/lib/autonomous-ops/pending-external-actions";

export type ImprovementArea =
  | "content_quality"
  | "instagram"
  | "naver_blog"
  | "cron_reliability"
  | "policy_insight"
  | "customer_support"
  | "growth";

export type ImprovementSeverity = "high" | "medium" | "low";

export type ImprovementRecommendation = {
  area: ImprovementArea;
  severity: ImprovementSeverity;
  title: string;
  evidence: string;
  action: string;
};

export type ImprovementSnapshot = {
  blogQualityFlags24h: number;
  instagramFailures24h: number;
  instagramSkips24h: number;
  naverPendingQueue: number;
  naverSuccess24h: number;
  cronFailures24h: number;
  supportOpenOver24h: number;
  policyInsightPct: number;
  snsRuns24h: number;
  blogPublishRuns24h: number;
  qualityImprovementHints: string[];
  externalQualityPending: number;
  // 2026-05-18 — 본문 평균 길이 사고 감지 (5/18 OpenAI 사고 학습).
  // 정상 ~1,900자. < 1,700자 = LLM dysfunction 의심.
  blogBodyAvgChars24h?: number;
  blogBodyAnomaly?: boolean;
  // 2026-05-19 — 사장님 외부 액션 잔여 (PendingExternalActionsCard 와 통합).
  pendingExternalActionsCount?: number;
};

export type ImprovementScanRun = {
  createdAt: string;
  highestSeverity: ImprovementSeverity;
  snapshot: ImprovementSnapshot;
  recommendations: ImprovementRecommendation[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const since24h = () => new Date(Date.now() - DAY_MS).toISOString();

// buildImprovementRecommendations 의 stable sort 기준.
// 사장님 hub 의 ImprovementPanel 이 첫 4건만 표시 → high 우선 보장.
const SEVERITY_RANK: Record<ImprovementSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type CountResult = {
  count: number | null;
  error: unknown;
};

type CountQuery = PromiseLike<CountResult> & {
  eq(column: string, value: unknown): CountQuery;
  gte(column: string, value: string): CountQuery;
  lt(column: string, value: string): CountQuery;
};

async function countAdminAction(action: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", action)
      .gte("created_at", since24h());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countExternalQualityPending(): Promise<number> {
  try {
    const admin = createAdminClient();
    const [instagram, naver] = await Promise.all([
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .not("published_at", "is", null)
        .is("instagram_published_at", null)
        .lt("instagram_attempt_count", 3)
        .or("admin_review_required.is.null,admin_review_required.eq.true"),
      admin
        .from("naver_blog_queue")
        .select("id, blog_post:blog_posts!inner(id, admin_review_required)", {
          count: "exact",
          head: true,
        })
        .eq("status", "pending")
        .lt("attempt_count", 3)
        .or("admin_review_required.is.null,admin_review_required.eq.true", {
          referencedTable: "blog_post",
        }),
    ]);
    return (instagram.count ?? 0) + (naver.count ?? 0);
  } catch {
    return 0;
  }
}

async function countTableWhere(
  table: string,
  build: (query: CountQuery) => PromiseLike<CountResult>,
): Promise<number> {
  try {
    const admin = createAdminClient();
    const query = admin
      .from(table)
      .select("id", { count: "exact", head: true }) as unknown as CountQuery;
    const res = await build(query);
    if (res.error) return 0;
    return res.count ?? 0;
  } catch {
    return 0;
  }
}

async function getPolicyInsightPct(): Promise<number> {
  try {
    const admin = createAdminClient();
    const [welfareFilled, welfareTotal, loanFilled, loanTotal] = await Promise.all([
      admin
        .from("welfare_programs")
        .select("id", { count: "estimated", head: true })
        .not("unique_insight", "is", null),
      admin
        .from("welfare_programs")
        .select("id", { count: "estimated", head: true }),
      admin
        .from("loan_programs")
        .select("id", { count: "estimated", head: true })
        .not("unique_insight", "is", null),
      admin
        .from("loan_programs")
        .select("id", { count: "estimated", head: true }),
    ]);
    if (
      welfareFilled.error ||
      welfareTotal.error ||
      loanFilled.error ||
      loanTotal.error
    ) {
      return 0;
    }
    const filled = (welfareFilled.count ?? 0) + (loanFilled.count ?? 0);
    const total = (welfareTotal.count ?? 0) + (loanTotal.count ?? 0);
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  } catch {
    return 0;
  }
}

export async function collectImprovementSnapshot(): Promise<ImprovementSnapshot> {
  const [
    blogQualityFlags24h,
    instagramFailures24h,
    instagramSkips24h,
    naverPendingQueue,
    naverSuccess24h,
    cronFailures24h,
    supportOpenOver24h,
    policyInsightPct,
    snsRuns24h,
    blogPublishRuns24h,
    qualityImprovementHints,
    externalQualityPending,
    blogPublishStats,
    pendingExternalActions,
  ] = await Promise.all([
    countAdminAction("blog_quality_flag"),
    countAdminAction("instagram_publish_fail"),
    countAdminAction("instagram_publish_skipped"),
    countTableWhere("naver_blog_queue", (q) => q.eq("status", "pending")),
    countTableWhere("naver_publish_audit", (q) =>
      q.eq("result", "success").gte("attempted_at", since24h()),
    ),
    countTableWhere("cron_failure_log", (q) => q.gte("last_seen_at", since24h())),
    countTableWhere("support_tickets", (q) =>
      q.eq("status", "open").lt("created_at", since24h()),
    ),
    getPolicyInsightPct(),
    countAdminAction("sns_publish_run"),
    countAdminAction("blog_publish_run"),
    getRecentQualityImprovementHints({ lookbackMs: DAY_MS }),
    countExternalQualityPending(),
    getBlogPublishStats(),
    getPendingExternalActions(),
  ]);

  return {
    blogQualityFlags24h,
    instagramFailures24h,
    instagramSkips24h,
    naverPendingQueue,
    naverSuccess24h,
    cronFailures24h,
    supportOpenOver24h,
    policyInsightPct,
    snsRuns24h,
    blogPublishRuns24h,
    qualityImprovementHints,
    externalQualityPending,
    blogBodyAvgChars24h: blogPublishStats.avgBodyChars24h ?? undefined,
    blogBodyAnomaly: blogPublishStats.bodyStatus === "anomaly",
    pendingExternalActionsCount: pendingExternalActions.length,
  };
}

export function buildImprovementRecommendations(
  s: ImprovementSnapshot,
): ImprovementRecommendation[] {
  const recs: ImprovementRecommendation[] = [];

  if (s.blogQualityFlags24h >= 3) {
    recs.push({
      area: "content_quality",
      severity: "high",
      title: "블로그 품질 경고가 많습니다",
      evidence: `24시간 품질 경고 ${s.blogQualityFlags24h}건`,
      action:
        s.qualityImprovementHints.length > 0
          ? `최근 지적: ${s.qualityImprovementHints.slice(0, 3).join(" / ")}`
          : "발행 프롬프트에 대상·지원금·마감·신청 링크 검증 문장을 강화하고, score 2 이하 글은 자동 외부 발행 전 보류하세요.",
    });
  } else if (s.blogQualityFlags24h > 0) {
    recs.push({
      area: "content_quality",
      severity: "medium",
      title: "일부 글은 검수 큐를 확인해야 합니다",
      evidence: `24시간 품질 경고 ${s.blogQualityFlags24h}건`,
      action:
        s.qualityImprovementHints.length > 0
          ? `최근 지적: ${s.qualityImprovementHints.slice(0, 3).join(" / ")}`
          : "/admin/blog 에서 경고 글의 제목·도입부·CTA를 보강하고 같은 패턴을 다음 발행 프롬프트에 반영하세요.",
    });
  }

  if (s.instagramFailures24h >= 3) {
    recs.push({
      area: "instagram",
      severity: "high",
      title: "인스타그램 발행 실패가 누적됐습니다",
      evidence: `24시간 실패 ${s.instagramFailures24h}건`,
      action:
        "OAuth 토큰, 카드 이미지 URL 3장, Graph API 컨테이너 생성 로그를 확인하고 실패 글은 attempt 3회 전 재시도하세요.",
    });
  } else if (s.instagramSkips24h >= 6 && s.snsRuns24h === 0) {
    recs.push({
      area: "instagram",
      severity: "medium",
      title: "인스타그램 발행이 계속 스킵되고 있습니다",
      evidence: `24시간 skip ${s.instagramSkips24h}건, SNS 발행 ${s.snsRuns24h}건`,
      action:
        "/admin/instagram 에서 OAuth 연결 상태와 시간대·일일 cap 조건을 확인하세요.",
    });
  }

  if (s.naverPendingQueue >= 20 && s.naverSuccess24h === 0) {
    recs.push({
      area: "naver_blog",
      severity: "high",
      title: "네이버 블로그 큐가 쌓였지만 성공 발행이 없습니다",
      evidence: `대기 ${s.naverPendingQueue}건, 24시간 성공 ${s.naverSuccess24h}건`,
      action:
        "본체 PC Chrome Extension dry-run 후 실제 발행을 재개하고, cookies 만료·캡차·2FA 여부를 확인하세요.",
    });
  } else if (s.naverPendingQueue >= 10) {
    recs.push({
      area: "naver_blog",
      severity: "medium",
      title: "네이버 블로그 발행 대기열을 줄여야 합니다",
      evidence: `대기 ${s.naverPendingQueue}건`,
      action:
        "일일 cap 안에서 extension 실행 빈도를 늘리거나 오래된 정책 글부터 우선 발행하세요.",
    });
  }

  if (s.cronFailures24h > 0) {
    recs.push({
      area: "cron_reliability",
      severity: "high",
      title: "최근 cron 실패가 있습니다",
      evidence: `24시간 cron 실패 ${s.cronFailures24h}건`,
      action:
        "/admin/cron-failures 에서 실패 job을 확인하고 failed-cron-retry 결과와 Vercel function 로그를 대조하세요.",
    });
  }

  if (s.policyInsightPct > 0 && s.policyInsightPct < 80) {
    recs.push({
      area: "policy_insight",
      severity: "medium",
      title: "정책 해설 커버리지가 낮습니다",
      evidence: `unique_insight 채움률 ${s.policyInsightPct}%`,
      action:
        "policy-insight-backfill cron 결과를 확인하고 OpenAI 키·DDL 적용 상태를 점검해 thin content 위험을 낮추세요.",
    });
  }

  if (s.supportOpenOver24h > 0) {
    recs.push({
      area: "customer_support",
      severity: "medium",
      title: "24시간 넘은 미답변 문의가 있습니다",
      evidence: `미답변 ${s.supportOpenOver24h}건`,
      action:
        "/admin/support 에서 답변하고, 반복되는 문의는 자동 응답 매핑 또는 RAG 답변으로 승격하세요.",
    });
  }

  if (s.blogPublishRuns24h > 0 && s.snsRuns24h === 0) {
    recs.push({
      area: "growth",
      severity: "low",
      title: "블로그 발행 대비 SNS 확산 흔적이 없습니다",
      evidence: `블로그 발행 ${s.blogPublishRuns24h}건, SNS 발행 ${s.snsRuns24h}건`,
      action:
        "sns-publish-blog cron 설정과 플랫폼 토큰을 확인해 새 글이 네이버·인스타 외 채널에도 재활용되게 하세요.",
    });
  }

  if (s.externalQualityPending >= 5) {
    recs.push({
      area: "content_quality",
      severity: "high",
      title: "품질 검수 대기 때문에 외부 발행이 막혀 있습니다",
      evidence: `외부 발행 품질 대기 ${s.externalQualityPending}건`,
      action:
        "blog-quality-check cron을 수동 실행하고, score 2 이하 글은 improvements 지적을 반영한 뒤 재검수하세요.",
    });
  } else if (s.externalQualityPending > 0) {
    recs.push({
      area: "content_quality",
      severity: "medium",
      title: "외부 발행 전 품질 검수가 필요한 글이 있습니다",
      evidence: `외부 발행 품질 대기 ${s.externalQualityPending}건`,
      action:
        "다음 품질 검수 cron 이후 네이버/인스타 큐가 다시 흐르는지 확인하세요.",
    });
  }

  // 2026-05-19 — 사장님 외부 액션 잔여 자동 제안
  if (s.pendingExternalActionsCount !== undefined && s.pendingExternalActionsCount > 0) {
    recs.push({
      area: "growth",
      severity: s.pendingExternalActionsCount >= 3 ? "high" : "medium",
      title: "사장님 외부 액션이 누적되어 있습니다",
      evidence: `잔여 ${s.pendingExternalActionsCount}건 (env 미설정·audit 미가동·보안 회전 미완)`,
      action:
        "/admin/autonomous 상단 PendingExternalActionsCard 에서 각 액션 가이드 link 확인 후 처리 — 평균 5~10분/건.",
    });
  }

  // 2026-05-18 — 본문 평균 길이 사고 의심 (OpenAI 마이그 사고 패턴)
  if (s.blogBodyAnomaly && s.blogBodyAvgChars24h !== undefined) {
    recs.push({
      area: "content_quality",
      severity: "high",
      title: "블로그 본문 평균 길이가 너무 짧습니다 — LLM dysfunction 의심",
      evidence: `24시간 본문 평균 ${s.blogBodyAvgChars24h}자 (정상 1,900자 내외, 임계 1,700자)`,
      action:
        "5/18 OpenAI 마이그 사고 패턴 (591~859자) 재발 의심. lib/ai.ts 의 model/maxTokens/jsonMode 변경 여부 확인 + 메모리 [keepioo-blog-revert-2026-05-18] 참조 + 즉시 revert 검토.",
    });
  }

  if (recs.length === 0) {
    recs.push({
      area: "growth",
      severity: "low",
      title: "큰 개선 경고는 없습니다",
      evidence: "24시간 핵심 운영 신호가 임계치 안에 있습니다",
      action:
        "다음 개선은 검색 유입이 낮은 카테고리의 long-tail 키워드 글 생성과 정책 해설 커버리지 확장입니다.",
    });
  }

  // severity 정렬 — 사장님 hub 의 ImprovementPanel 이 첫 4건만 표시하므로
  // high 가 항상 앞에 와야 함. 같은 severity 안에서는 원래 순서 유지
  // (Array.sort 가 ES2019+ stable).
  recs.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  return recs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toSeverity(value: unknown): ImprovementSeverity {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function toSnapshot(value: unknown): ImprovementSnapshot {
  const fallback: ImprovementSnapshot = {
    blogQualityFlags24h: 0,
    instagramFailures24h: 0,
    instagramSkips24h: 0,
    naverPendingQueue: 0,
    naverSuccess24h: 0,
    cronFailures24h: 0,
    supportOpenOver24h: 0,
    policyInsightPct: 0,
    snsRuns24h: 0,
    blogPublishRuns24h: 0,
    qualityImprovementHints: [],
    externalQualityPending: 0,
  };
  if (!isRecord(value)) return fallback;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, defaultValue]) => {
      const raw = value[key];
      if (Array.isArray(defaultValue)) {
        return [
          key,
          Array.isArray(raw)
            ? raw.filter((item): item is string => typeof item === "string")
            : defaultValue,
        ];
      }
      return [key, typeof raw === "number" ? raw : defaultValue];
    }),
  ) as ImprovementSnapshot;
}

function toRecommendation(value: unknown): ImprovementRecommendation | null {
  if (!isRecord(value)) return null;
  const area = value.area;
  const title = value.title;
  const evidence = value.evidence;
  const action = value.action;
  if (
    area !== "content_quality" &&
    area !== "instagram" &&
    area !== "naver_blog" &&
    area !== "cron_reliability" &&
    area !== "policy_insight" &&
    area !== "customer_support" &&
    area !== "growth"
  ) {
    return null;
  }
  if (
    typeof title !== "string" ||
    typeof evidence !== "string" ||
    typeof action !== "string"
  ) {
    return null;
  }
  return {
    area,
    severity: toSeverity(value.severity),
    title,
    evidence,
    action,
  };
}

// admin_actions row → ImprovementScanRun 파싱 (getLatestImprovementScan +
// getPreviousImprovementScan 공유). null 반환 케이스: details 가 object 아님.
export function parseImprovementScanRow(
  row: { details: unknown; created_at: string | null },
): ImprovementScanRun | null {
  if (!isRecord(row.details)) return null;
  const rawRecommendations = row.details.recommendations;
  const recommendations = Array.isArray(rawRecommendations)
    ? rawRecommendations
        .map(toRecommendation)
        .filter((r): r is ImprovementRecommendation => r !== null)
    : [];
  return {
    createdAt: String(row.created_at ?? ""),
    highestSeverity: toSeverity(row.details.highestSeverity),
    snapshot: toSnapshot(row.details.snapshot),
    recommendations,
  };
}

export async function getLatestImprovementScan(): Promise<ImprovementScanRun | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "autonomous_improvement_scan_run")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return parseImprovementScanRow(data);
  } catch {
    return null;
  }
}

// 두 번째 최근 scan — getLatestImprovementScan 의 hub UI 가 "어제 vs 오늘"
// 추세 비교에 사용. cron 이 매일 KST 10:20 실행이라 두 번째 row ≈ 어제.
// 데이터 부족 (가동 1일차) 시 null 반환.
export async function getPreviousImprovementScan(): Promise<ImprovementScanRun | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_actions")
      .select("details, created_at")
      .eq("action", "autonomous_improvement_scan_run")
      .order("created_at", { ascending: false })
      .range(1, 1); // 0-indexed: row 1 = 두 번째 최근
    if (error || !data || data.length === 0) return null;
    return parseImprovementScanRow(data[0]);
  } catch {
    return null;
  }
}
