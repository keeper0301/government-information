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
  const [phases, improvementScan, previousScan] = await Promise.all([
    getAllPhaseStatuses(),
    getLatestImprovementScan(),
    getPreviousImprovementScan(),
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

      <ImprovementPanel scan={improvementScan} previousScan={previousScan} />

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
