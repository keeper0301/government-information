// ============================================================
// /admin/autonomous — 자율 운영 마스터 5 Phase hub
// ============================================================
// 사장님 매일 1번 클릭 = 평시 0분 운영 모드 달성.
// 5 Phase 가동 상태 + 24h 활동 요약 + 외부 액션 미완료 가이드.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  getAllPhaseStatuses,
  aggregatePendingActions,
  type PhaseStatus,
  type AggregatedPendingAction,
} from "@/lib/autonomous-ops/status";
import {
  getLatestImprovementScan,
  getPreviousImprovementScan,
  type ImprovementRecommendation,
  type ImprovementScanRun,
} from "@/lib/autonomous-ops/improvement-scan";
import { parseActionSegments } from "@/lib/autonomous-ops/improvement-actions";
import {
  collectRevenueDailySeries,
  type DailyRevenue,
} from "@/lib/monitoring/adsense-revenue-trend";
import {
  getEventTypeStats24h,
  getTopProgramsByEvents,
  type EventTypeStats,
  type TopProgram,
} from "@/lib/analytics/click-aggregation";
import {
  getPopularityTrend,
  type ProgramTrend,
} from "@/lib/analytics/popularity-trend";
import {
  getSnsPublishStats,
  type SnsPublishStats,
} from "@/lib/analytics/sns-publish-stats";
import {
  getSnsEnvStatus,
  type SnsEnvStatus,
} from "@/lib/analytics/sns-env-status";
import {
  getGeminiSpendingStats,
  type GeminiSpendingStat,
} from "@/lib/analytics/gemini-spending";
import { getLocalPressStats } from "@/lib/analytics/local-press-stats";
import { LocalPressCard } from "./_components/local-press-card";
import { getPressIngestTierStats } from "@/lib/analytics/press-ingest-tier-stats";
import { PressIngestTierCard } from "./_components/press-ingest-tier-card";
import { getBlogPublishStats } from "@/lib/analytics/blog-publish-stats";
import { BlogPublishCard } from "./_components/blog-publish-card";

// severity 시각 분기 — high(0) < medium(1) < low(2). rank 큰 쪽이 개선.
const SEVERITY_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const metadata: Metadata = {
  title: "자율 운영 마스터 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/autonomous");
  if (!isAdminUser(user.email)) redirect("/");
  return user;
}

export default async function AdminAutonomousPage() {
  await requireAdmin();
  const [
    phases,
    improvementScan,
    previousScan,
    revenueSeries,
    eventStats24h,
    topPrograms,
    popularityTrend,
    snsStats,
    snsEnvStatus,
    geminiSpending,
    localPressStats,
    pressIngestTierStats,
    blogPublishStats,
  ] = await Promise.all([
    getAllPhaseStatuses(),
    getLatestImprovementScan(),
    getPreviousImprovementScan(),
    collectRevenueDailySeries(30),
    getEventTypeStats24h(),
    getTopProgramsByEvents(30, 5),
    getPopularityTrend(3),
    getSnsPublishStats(30),
    getSnsEnvStatus(),
    getGeminiSpendingStats(28),
    getLocalPressStats(),
    getPressIngestTierStats(),
    getBlogPublishStats(),
  ]);
  const activeCount = phases.filter((p) => p.active).length;
  // pendingActions 단일 source — header description + PendingActionsPanel 양쪽 같은 결과.
  const pendingActions = aggregatePendingActions(phases);

  return (
    <div className="max-w-[980px]">
      <AdminPageHeader
        kicker="ADMIN · 운영 상태"
        title="자율 운영 마스터"
        description={`5 Phase 중 ${activeCount}개 가동 · 외부 액션 ${pendingActions.length}건 대기. 매일 1번 점검 권장.`}
      />

      {/* 1. 자동 개선 진단 — 사장님이 가장 먼저 보는 행동 액션 */}
      <SectionHeader title="🎯 오늘 반영할 개선 과제" />
      <ImprovementPanel scan={improvementScan} previousScan={previousScan} />

      {/* 2. 수익·비용 — 매출 추세 + 콘텐츠 비용 */}
      <SectionHeader title="💰 수익 · 비용" />
      <RevenueChartCard series={revenueSeries} />
      <GeminiSpendingCard stats={geminiSpending} />

      {/* 3. 사용자 가치 — 클릭·인기 가시화 */}
      <SectionHeader title="📈 사용자 가치" />
      <ClickStatsCard stats={eventStats24h} top={topPrograms} />
      <PopularityTrendCard trend={popularityTrend} />

      {/* 4. 콘텐츠 발행 — 블로그·SNS 가동 상태 (5/17 BlogPublish 신규) */}
      <SectionHeader title="📝 콘텐츠 발행" />
      <BlogPublishCard stats={blogPublishStats} />
      <SnsPublishCard stats={snsStats} envStatus={snsEnvStatus} />

      {/* 5. 데이터 수집 — cron 자동 가동 결과 (5/17 신규) */}
      <SectionHeader title="🗞️ 데이터 수집" />
      <div className="mb-4">
        <LocalPressCard stats={localPressStats} />
      </div>
      <div className="mb-4">
        <PressIngestTierCard stats={pressIngestTierStats} />
      </div>

      {/* 6. 외부 액션 + Phase 상태 */}
      <SectionHeader title="⚙️ Phase 가동 + 외부 액션" />
      <PendingActionsPanel actions={pendingActions} />

      <div className="space-y-3">
        {phases.map((p) => (
          <PhaseCard key={p.phase} status={p} />
        ))}
      </div>

      <p className="mt-6 text-xs text-grey-600">
        spec 문서: <code>docs/superpowers/specs/2026-05-08-autonomous-ops-master-design.md</code>
        {" · "}
        Phase 진행 메모리: <code>memory/project_keepioo_autonomous_ops_master_2026_05_08.md</code>
      </p>
    </div>
  );
}

// 5/17 추가 — 14+ 카드를 5 카테고리로 grouping 해 사장님 매일 30초 점검 가독성 ↑.
function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wider text-grey-500 first:mt-0">
      {title}
    </h2>
  );
}

function ImprovementPanel({
  scan,
  previousScan,
}: {
  scan: ImprovementScanRun | null;
  previousScan: ImprovementScanRun | null;
}) {
  if (!scan) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          자동 개선 스캔
        </div>
        <p className="text-sm text-grey-800">
          아직 실행 기록이 없습니다. 다음 KST 10:20 cron 이후 개선 과제가 표시됩니다.
        </p>
      </section>
    );
  }

  const tone =
    scan.highestSeverity === "high"
      ? "border-red-200 bg-red-50/50"
      : scan.highestSeverity === "medium"
        ? "border-amber-200 bg-amber-50/50"
        : "border-green-200 bg-green-50/40";
  const label =
    scan.highestSeverity === "high"
      ? "긴급"
      : scan.highestSeverity === "medium"
        ? "주의"
        : "정상";

  // 어제 vs 오늘 추세 — 사장님이 사고 추가/개선 한 눈에 인식.
  // previousScan null = 가동 1일차 (데이터 부족).
  const trend = previousScan
    ? {
        prevCount: previousScan.recommendations.length,
        diff: scan.recommendations.length - previousScan.recommendations.length,
        severityChange:
          previousScan.highestSeverity !== scan.highestSeverity,
        prevSeverity: previousScan.highestSeverity,
      }
    : null;

  return (
    <section className={`mb-4 rounded-lg border p-4 ${tone}`}>
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-semibold text-grey-600 mb-1">
            자동 개선 스캔
          </div>
          <h2 className="text-base font-semibold">오늘 반영할 개선 과제</h2>
          {trend && (
            <p className="text-[11px] text-grey-700 mt-1">
              어제 {trend.prevCount}건 → 오늘 {scan.recommendations.length}건{" "}
              <span
                className={
                  trend.diff > 0
                    ? "text-red-700 font-semibold"
                    : trend.diff < 0
                      ? "text-green-700 font-semibold"
                      : "text-grey-600"
                }
              >
                ({trend.diff > 0 ? "+" : ""}
                {trend.diff})
              </span>
              {trend.severityChange && (
                <span
                  className={
                    // severity rank: high(0) < medium(1) < low(2). rank ↑ = 개선.
                    SEVERITY_RANK[scan.highestSeverity] >
                    SEVERITY_RANK[trend.prevSeverity]
                      ? "text-green-700 font-semibold"
                      : "text-red-700 font-semibold"
                  }
                >
                  {" · severity "}
                  {trend.prevSeverity} → {scan.highestSeverity}
                </span>
              )}
            </p>
          )}
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-grey-800">
          {label}
        </span>
      </header>

      <ol className="space-y-2">
        {scan.recommendations.slice(0, 4).map((r, i) => (
          <ImprovementItem key={`${r.area}-${i}`} item={r} />
        ))}
      </ol>

      {scan.recommendations.length > 4 && (
        <p className="mt-2 text-[11px] text-amber-700">
          외 {scan.recommendations.length - 4}건 더 있습니다 (severity 낮은
          순으로 숨김). 위 4건 처리 후 자동 갱신.
        </p>
      )}

      <p className="mt-3 text-[11px] text-grey-600">
        최근 실행:{" "}
        {new Date(scan.createdAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}
      </p>
    </section>
  );
}

function ImprovementItem({ item }: { item: ImprovementRecommendation }) {
  const severity =
    item.severity === "high" ? "text-red-700" : item.severity === "medium" ? "text-amber-700" : "text-green-700";
  // action 텍스트에서 /admin/* 경로 자동 추출 → 클릭 link 변환.
  // 경로 없는 텍스트는 그대로 plain text.
  const segments = parseActionSegments(item.action);
  return (
    <li className="rounded border border-white/70 bg-white px-3 py-2 text-sm">
      <div className={`text-[11px] font-semibold ${severity}`}>
        {item.severity.toUpperCase()} · {item.area}
      </div>
      <div className="font-medium text-grey-900">{item.title}</div>
      <div className="text-xs text-grey-600">{item.evidence}</div>
      <div className="mt-1 text-xs text-grey-800">
        {segments.map((seg, i) =>
          seg.type === "link" ? (
            <a
              key={i}
              href={seg.href}
              className="text-blue-600 underline hover:text-blue-800"
            >
              {seg.label}
            </a>
          ) : (
            <span key={i}>{seg.value}</span>
          ),
        )}
      </div>
    </li>
  );
}

// AdSense 30일 매출 카드 — 단순 SVG sparkline + 합계·평균.
// 데이터 0건 시 "매출 데이터 없음" 안내 (env 미설정·cron 미가동 모두 graceful).
function RevenueChartCard({ series }: { series: DailyRevenue[] }) {
  if (series.length === 0) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          AdSense 매출
        </div>
        <p className="text-sm text-grey-700">
          매출 데이터 없음. external-console-check cron 가동 또는 ADSENSE_*
          env 등록 후 표시됩니다.
        </p>
      </section>
    );
  }

  const total = series.reduce((s, d) => s + d.earnings, 0);
  const avg = total / series.length;
  const max = Math.max(...series.map((d) => d.earnings), 0.01);
  const currency = series[0]?.currency ?? "USD";

  // SVG sparkline — 200 × 40px
  const W = 240;
  const H = 50;
  const points = series
    .map((d, i) => {
      const x = (i / Math.max(1, series.length - 1)) * W;
      const y = H - (d.earnings / max) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-grey-600 mb-1">
            AdSense {series.length}일 매출
          </div>
          <h2 className="text-base font-semibold">
            {currency} {total.toFixed(2)}
          </h2>
          <p className="text-xs text-grey-700 mt-1">
            평균 {avg.toFixed(2)}/일 · 최대 {max.toFixed(2)}
          </p>
        </div>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="overflow-visible"
          aria-label="AdSense 매출 sparkline"
        >
          <polyline
            fill="none"
            stroke="#059669"
            strokeWidth="1.5"
            points={points}
          />
        </svg>
      </header>
    </section>
  );
}

// Phase A — 24h 클릭 event 합계 + 30일 인기 정책 top 5.
// 사용자 활동 가시화 + 추천 정확도 학습 시그널.
const EVENT_LABEL: Record<string, string> = {
  program_view: "정책 상세 진입",
  apply_click: "신청 버튼 클릭",
  recommend_click: "/recommend 카드 클릭",
  home_recommend_click: "홈 추천 카드 클릭",
};

function ClickStatsCard({
  stats,
  top,
}: {
  stats: EventTypeStats[];
  top: TopProgram[];
}) {
  if (stats.length === 0 && top.length === 0) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          사용자 클릭 분석
        </div>
        <p className="text-sm text-grey-700">
          아직 click 데이터 없음. /api/events/track endpoint 가 사용자 액션
          기록 시작. 30일 누적 후 추천 정확도 학습.
        </p>
      </section>
    );
  }
  const total24h = stats.reduce((s, e) => s + e.count, 0);
  return (
    <section className="mb-4 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <header className="mb-3">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          사용자 클릭 분석 (Phase A)
        </div>
        <h2 className="text-base font-semibold">
          24h 총 {total24h.toLocaleString()}건
        </h2>
      </header>
      {stats.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 text-sm mb-3">
          {stats.slice(0, 4).map((s) => (
            <li
              key={s.event_type}
              className="rounded border border-grey-200 bg-white px-2 py-1"
            >
              <div className="text-[11px] text-grey-600">
                {EVENT_LABEL[s.event_type] ?? s.event_type}
              </div>
              <div className="font-medium">{s.count.toLocaleString()}건</div>
            </li>
          ))}
        </ul>
      )}
      {top.length > 0 && (
        <div className="rounded border border-grey-200 bg-white p-2">
          <div className="text-[11px] font-semibold text-grey-700 mb-1">
            30일 인기 정책 top {top.length} (view + apply×5)
          </div>
          <ol className="text-xs text-grey-800 list-decimal pl-4 space-y-0.5">
            {top.map((t, i) => (
              <li key={i}>
                <a
                  href={`/${t.programTable === "welfare_programs" ? "welfare" : "loan"}/${t.programId}`}
                  className="text-blue-600 hover:text-blue-800 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.programTable === "welfare_programs" ? "복지" : "정책자금"} #
                  {t.programId.slice(0, 8)}
                </a>
                <span className="text-grey-500 ml-1">
                  · view {t.viewCount} / apply {t.applyClickCount}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// Phase A 12차 — 30일 popularity 추세 sparkline.
// popularity_snapshots 가 매일 KST 03:00 cron 으로 누적. snapshot 0 건이면
// "데이터 누적 중" 안내 (cron 처음 가동 시 graceful).
function PopularityTrendCard({ trend }: { trend: ProgramTrend[] }) {
  if (trend.length === 0) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          인기 정책 추세
        </div>
        <p className="text-sm text-grey-700">
          데이터 누적 중. /api/cron/popularity-snapshot 첫 실행 후 30일 추세 표시됩니다.
        </p>
      </section>
    );
  }

  // 차트 W × H — RevenueChartCard 와 동일 비율
  const W = 240;
  const H = 50;

  return (
    <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <header className="mb-3">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          30일 인기 정책 추세
        </div>
        <h2 className="text-sm font-semibold text-grey-900">
          누적 score top {trend.length} · 매일 KST 03:00 갱신
        </h2>
      </header>
      <ul className="space-y-3">
        {trend.map((t) => {
          const max = Math.max(...t.series.map((p) => p.score), 0.5);
          const points = t.series
            .map((p, i) => {
              const x =
                t.series.length > 1
                  ? (i / (t.series.length - 1)) * W
                  : W / 2;
              const y = H - (p.score / max) * H;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          const href =
            t.program_table === "welfare_programs"
              ? `/welfare/${t.program_id}`
              : t.program_table === "loan_programs"
                ? `/loan/${t.program_id}`
                : `/news/${t.program_id}`;
          const label =
            t.program_table === "welfare_programs"
              ? "복지"
              : t.program_table === "loan_programs"
                ? "정책자금"
                : "뉴스";
          return (
            <li
              key={t.program_id}
              className="flex items-center gap-3 justify-between"
            >
              <div className="flex-1 min-w-0">
                <a
                  href={href}
                  className="text-sm font-medium text-blue-700 hover:underline line-clamp-1"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.title ?? `#${t.program_id.slice(0, 8)}`}
                </a>
                <p className="text-[11px] text-grey-600 mt-0.5">
                  {label} · 현재 score {t.latest_score.toFixed(1)} · {t.series.length}일
                </p>
              </div>
              <svg
                width={W}
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                className="flex-shrink-0"
                aria-label={`${t.title} 추세`}
              >
                <polyline
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="1.5"
                  points={points}
                />
              </svg>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// B 2차 — SNS 발행 현황 30일 (Twitter/Facebook/Threads/Instagram).
// 채널별 ok/fail + 가장 빈번한 fail 사유 1건 표시.
// 발행 0건 시 "발행 데이터 없음" 안내 (env 미설정 또는 cron 첫 가동 전).
function SnsPublishCard({
  stats,
  envStatus,
}: {
  stats: SnsPublishStats;
  envStatus: SnsEnvStatus[];
}) {
  const notReadyChannels = envStatus.filter((e) => !e.ready);

  if (stats.totalPosts === 0 && stats.channels.length === 0) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          SNS 발행 현황
        </div>
        <p className="text-sm text-grey-700 mb-3">
          최근 {stats.windowDays}일 발행 데이터 없음. SNS env 미설정 또는 cron
          첫 가동 대기 중.
        </p>
        {notReadyChannels.length > 0 && (
          <SnsEnvGuide notReady={notReadyChannels} />
        )}
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
      <header className="mb-3">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          SNS 발행 현황
        </div>
        <h2 className="text-sm font-semibold text-grey-900">
          최근 {stats.windowDays}일 · 정책+blog {stats.totalPosts}건 발행 시도
        </h2>
      </header>
      {notReadyChannels.length > 0 && (
        <div className="mb-3">
          <SnsEnvGuide notReady={notReadyChannels} />
        </div>
      )}
      <ul className="space-y-2">
        {stats.channels.map((c) => {
          const total = c.ok + c.fail;
          const successRate = total > 0 ? Math.round((c.ok / total) * 100) : 0;
          const isHealthy = c.ok > 0 && successRate >= 80;
          return (
            <li
              key={c.channel}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
                  aria-hidden
                />
                <span className="font-medium text-grey-900 capitalize">
                  {c.channel}
                </span>
              </div>
              <div className="text-xs text-grey-700">
                <span className="text-emerald-700">{c.ok}</span>
                <span className="text-grey-400 mx-1">/</span>
                <span className="text-grey-500">{total}</span>
                <span className="text-grey-500 ml-1">({successRate}%)</span>
                {c.topFailReason && c.fail > 0 && (
                  <span
                    className="text-amber-700 ml-2"
                    title={`가장 빈번한 fail 사유 ${c.fail}건`}
                  >
                    · {c.topFailReason}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// 5/17 — Gemini 28일 토큰 누적 + ₩ 추정 카드.
// keepioo 프로젝트 cap ₩30K 대비 사용량 비율 시각화.
// blog_publish_run audit 의 results[].usage 누적 (G3 분리 후 keepioo project 만 추적).
function GeminiSpendingCard({ stats }: { stats: GeminiSpendingStat }) {
  const CAP_KRW = 30000; // G3 keepioo 프로젝트 spending cap (₩30K)
  const projectionRatio = Math.min(1, stats.monthlyProjectionKrw / CAP_KRW);
  const projectionPercent = Math.round(projectionRatio * 100);
  const danger = projectionRatio >= 0.8;

  if (stats.totalCalls === 0) {
    return (
      <section className="mb-4 rounded-lg border border-grey-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          Gemini 지출 (keepioo)
        </div>
        <p className="text-sm text-grey-700">
          최근 {stats.windowDays}일 blog 발행 token 데이터 없음. 다음 cron 가동 후 누적 시작.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`mb-4 rounded-lg border p-4 ${
        danger
          ? "border-rose-200 bg-rose-50/40"
          : "border-violet-200 bg-violet-50/40"
      }`}
    >
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-grey-600 mb-1">
            Gemini 지출 (keepioo blog 발행)
          </div>
          <h2 className="text-base font-semibold">
            ₩{Math.round(stats.totalCostKrw).toLocaleString()}{" "}
            <span className="text-xs text-grey-600">/ {stats.windowDays}일</span>
          </h2>
          <p className="text-xs text-grey-700 mt-1">
            {stats.totalCalls}건 발행 · in {stats.totalInputTokens.toLocaleString()} · out {stats.totalOutputTokens.toLocaleString()} tokens
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-grey-600">월 추정 / cap</div>
          <div
            className={`text-lg font-bold ${danger ? "text-rose-700" : "text-violet-700"}`}
          >
            ₩{Math.round(stats.monthlyProjectionKrw).toLocaleString()}
          </div>
          <div className="text-[10px] text-grey-600">
            / ₩{CAP_KRW.toLocaleString()} ({projectionPercent}%)
          </div>
        </div>
      </header>
      <div className="w-full h-1.5 bg-grey-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${danger ? "bg-rose-500" : "bg-violet-500"}`}
          style={{ width: `${projectionPercent}%` }}
          aria-label={`월 추정 ${projectionPercent}%`}
        />
      </div>
      {danger && (
        <p className="text-xs text-rose-700 mt-2 font-medium">
          ⚠️ 월 추정이 cap 80% 초과. https://aistudio.google.com/spend?project=keepioo 한도 인상 검토.
        </p>
      )}
    </section>
  );
}

// B 3차 — env 미설정 채널 가이드. 사장님 비개발자라 1줄 setup 안내.
function SnsEnvGuide({ notReady }: { notReady: SnsEnvStatus[] }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <div className="text-xs font-semibold text-amber-900 mb-2">
        ⚠️ 미설정 채널 {notReady.length}건 — Vercel env 추가 시 자동 가동
      </div>
      <ul className="space-y-1.5 text-xs text-grey-800">
        {notReady.map((e) => (
          <li key={e.channel}>
            <span className="font-medium capitalize">{e.channel}</span>
            <span className="text-grey-500"> · 부족: </span>
            <code className="text-amber-800 bg-amber-100 px-1 rounded text-[10px]">
              {e.missing.join(", ")}
            </code>
            <div className="text-[11px] text-grey-600 mt-0.5 pl-2">
              → {e.setupGuide}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 5 phase 의 pendingActions 를 한 카드에 통합. 사장님이 외부 액션 우선순위
// 한 화면 확인. 액션 0건이면 positive banner 표시 (사장님 매일 안심 신호).
function PendingActionsPanel({ actions }: { actions: AggregatedPendingAction[] }) {
  if (actions.length === 0) {
    return (
      <section className="mb-4 rounded-lg border border-green-200 bg-green-50/40 p-4">
        <div className="text-[11px] font-semibold text-grey-600 mb-1">
          외부 액션 통합
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            ✓ 외부 입력 대기 0건
          </span>
          <span className="text-xs text-grey-700">
            사장님이 처리할 액션이 없습니다. phase 별 가동 상태는 아래 카드에서 확인.
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-grey-600 mb-1">
            외부 액션 통합
          </div>
          <h2 className="text-base font-semibold">
            사장님 처리 대기 ({actions.length}건)
          </h2>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          5 Phase 통합
        </span>
      </header>
      <ol className="space-y-2">
        {actions.map((a, i) => (
          <li
            key={i}
            className="rounded border border-white/80 bg-white px-3 py-2 text-sm"
          >
            <div className="text-[11px] font-semibold text-amber-700 mb-1">
              Phase {a.phase} · {a.phaseTitle}
            </div>
            <div className="text-xs text-grey-800">
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {a.text} ↗
                </a>
              ) : (
                a.text
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-grey-600">
        각 액션 완료 후 hub 새로고침 시 자동 가동 (✓ 가동) 으로 전환됩니다.
      </p>
    </section>
  );
}

function PhaseCard({ status }: { status: PhaseStatus }) {
  const tone = status.active
    ? "border-green-200 bg-green-50/40"
    : "border-amber-200 bg-amber-50/40";
  const badge = status.active
    ? "bg-green-100 text-green-800"
    : "bg-amber-100 text-amber-800";
  return (
    <section className={`rounded-lg border p-4 ${tone}`}>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">
          Phase {status.phase} — {status.title}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>
          {status.active ? "✓ 가동" : "⚠ 외부 액션 대기"}
        </span>
      </header>

      <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm mb-3">
        {status.metrics.map((m) => (
          <li
            key={m.label}
            className="rounded border border-grey-200 bg-white px-2 py-1"
          >
            <div className="text-[11px] text-grey-600">{m.label}</div>
            <div className="font-medium">{m.value}</div>
          </li>
        ))}
      </ul>

      {status.pendingActions.length > 0 && (
        <div className="rounded border border-amber-200 bg-white p-2">
          <div className="text-[11px] font-semibold text-amber-800 mb-1">
            사장님 외부 액션 ({status.pendingActions.length}건)
          </div>
          <ol className="text-xs text-grey-800 list-decimal pl-4 space-y-0.5">
            {status.pendingActions.map((a, i) => (
              <li key={i}>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    {a.text} ↗
                  </a>
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
