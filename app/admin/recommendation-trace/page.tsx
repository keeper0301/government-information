// app/admin/recommendation-trace/page.tsx
// ============================================================
// 추천 시스템 진단 — 사장님 본인 + 가상 페르소나 6개 × 4 영역 trace
// ============================================================
// score.ts read-only. 각 정책의 차단 사유 분류 + 점수 분포 + 본문 발췌
// 로 false positive / negative 패턴 사장님이 직접 검토.
// ============================================================

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin-auth";
import { loadUserProfile } from "@/lib/personalization/load-profile";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  traceWelfare,
  traceLoan,
  traceNews,
  traceBlog,
  type AreaResult,
  type AreaName,
} from "./trace-area";
import { PersonaForm } from "./persona-form";
import { findPersona, type PersonaId } from "./personas";
import type { UserSignals } from "@/lib/personalization/types";
import type { BlockReason } from "@/lib/personalization/diagnostic";

export const metadata: Metadata = {
  title: "추천 진단 | 어드민",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const AREA_LABEL: Record<AreaName, string> = {
  welfare: "추천 정책",
  loan: "추천 대출",
  news: "정책 소식",
  blog: "블로그 가이드",
};

const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
  shown: "노출",
  below_min_score: "점수 부족",
  no_signal: "매칭 신호 없음",
  cohort_mismatch: "cohort 차단 ⚠ false positive 의심",
  regional_gate: "지역 mismatch",
  household_gate: "가구 mismatch",
  business_mismatch: "사업자 자격 미달",
  income_gate: "소득 미달",
};

export default async function RecommendationTracePage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/recommendation-trace");
  if (!isAdminUser(user.email)) redirect("/");

  const personaId: PersonaId = (params.persona as PersonaId) || "self";

  // signals 결정
  let signals: UserSignals | null = null;
  let label = "";
  let description = "";
  let isEmpty = false;

  if (personaId === "self") {
    const profile = await loadUserProfile();
    if (profile && !profile.isEmpty) {
      signals = profile.signals;
      label = `사장님 본인 (${profile.displayName})`;
      description = formatSignalsHuman(profile.signals);
    } else {
      isEmpty = true;
      label = "사장님 본인";
      description = "프로필이 비어있어요";
    }
  } else {
    const persona = findPersona(personaId);
    if (persona) {
      signals = persona.signals;
      label = persona.label;
      description = persona.description;
    } else {
      // invalid persona id → self fallback
      const profile = await loadUserProfile();
      if (profile && !profile.isEmpty) signals = profile.signals;
      label = "사장님 본인";
      description =
        profile && !profile.isEmpty
          ? formatSignalsHuman(profile.signals)
          : "프로필 비어있음";
      isEmpty = !signals;
    }
  }

  // signals 없으면 안내 + 페르소나 선택만
  if (!signals) {
    return (
      <div className="max-w-[1100px]">
        <AdminPageHeader
          kicker="ADMIN · 지표·분석"
          title="추천 진단"
          description="사장님 본인 + 가상 페르소나 × 4 영역의 노출/차단 패턴 측정"
        />
        <PersonaForm current={personaId} />
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {isEmpty
            ? "사장님 프로필이 비어있어요. 페르소나 2-6 중 선택하세요."
            : "프로필을 불러올 수 없어요."}
        </div>
      </div>
    );
  }

  // 4 영역 병렬 trace
  const [welfare, loan, news, blog] = await Promise.all([
    traceWelfare(signals),
    traceLoan(signals),
    traceNews(signals),
    traceBlog(signals),
  ]);

  return (
    <div className="max-w-[1100px]">
      <AdminPageHeader
        kicker="ADMIN · 지표·분석"
        title="추천 진단"
        description="사장님 본인 + 가상 페르소나 × 4 영역의 노출/차단 패턴 측정"
      />
      <PersonaForm current={personaId} />
      <div className="mt-2 mb-5 px-4 py-2.5 rounded-md bg-grey-50 text-xs text-grey-700">
        <strong className="text-grey-900">{label}</strong> — {description}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AreaCard result={welfare} />
        <AreaCard result={loan} />
        <AreaCard result={news} />
        <AreaCard result={blog} />
      </div>
    </div>
  );
}

function AreaCard({ result }: { result: AreaResult }) {
  const { area, traces, summary, error } = result;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-bold text-red-900">{AREA_LABEL[area]}</h2>
        <p className="text-xs text-red-700 mt-1">에러: {error}</p>
      </div>
    );
  }

  const shownPct =
    summary.total > 0 ? Math.round((summary.shown / summary.total) * 100) : 0;
  const blockedTotal = summary.total - summary.shown;
  const blockReasonsRanked = (
    Object.entries(summary.blocked) as [BlockReason, number][]
  )
    .filter(([reason, n]) => n > 0 && reason !== "shown")
    .sort((a, b) => b[1] - a[1]);
  const cohortBlocked = traces.filter(
    (t) => t.blockReason === "cohort_mismatch",
  );
  const otherBlocked = traces.filter(
    (t) =>
      t.blockReason !== "shown" && t.blockReason !== "cohort_mismatch",
  );
  const shownTraces = traces
    .filter((t) => t.blockReason === "shown")
    .sort((a, b) => b.score - a.score);

  return (
    <article className="rounded-lg border border-grey-200 bg-white p-4">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-grey-900">
          {AREA_LABEL[area]}
        </h2>
        <span className="text-xs text-grey-500">pool {summary.total}</span>
      </header>

      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-md bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">노출</p>
          <p className="text-base font-bold text-blue-900">
            {summary.shown}건 ({shownPct}%)
          </p>
        </div>
        <div className="flex-1 rounded-md bg-grey-100 px-3 py-2">
          <p className="text-xs text-grey-600">차단</p>
          <p className="text-base font-bold text-grey-900">
            {blockedTotal}건 ({100 - shownPct}%)
          </p>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-grey-700 mb-1">차단 사유</p>
        <ul className="text-xs space-y-0.5">
          {blockReasonsRanked.map(([reason, n]) => (
            <li key={reason} className="flex justify-between">
              <span className="text-grey-700">
                {BLOCK_REASON_LABEL[reason]}
              </span>
              <span className="font-semibold text-grey-900 tabular-nums">
                {n}건
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold text-grey-700 mb-1">점수 분포</p>
        <div className="flex gap-1 items-end">
          {summary.scoreDistribution.map((d) => (
            <div key={d.bucket} className="flex-1">
              <div
                className="rounded-sm bg-blue-200 flex items-end justify-center"
                style={{
                  height: `${Math.max(8, Math.min(40, d.count * 0.5 + 8))}px`,
                }}
              >
                <span className="text-xs text-blue-900 font-semibold">
                  {d.count}
                </span>
              </div>
              <p className="text-xs text-center text-grey-600 mt-0.5">
                {d.bucket}
              </p>
            </div>
          ))}
        </div>
      </div>

      {cohortBlocked.length > 0 && (
        <details className="mb-2">
          <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
            cohort 차단 {cohortBlocked.length}건 (false positive 의심)
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {cohortBlocked.slice(0, 5).map((t) => (
              <li
                key={t.programId}
                className="rounded bg-amber-50 border border-amber-100 p-2"
              >
                <p className="font-semibold text-grey-900">{t.programTitle}</p>
                {t.excerptForCohort && (
                  <p className="mt-0.5 text-grey-600 leading-snug">
                    {t.excerptForCohort}
                  </p>
                )}
              </li>
            ))}
            {cohortBlocked.length > 5 && (
              <li className="text-grey-500">
                ... 외 {cohortBlocked.length - 5}건
              </li>
            )}
          </ul>
        </details>
      )}

      {otherBlocked.length > 0 && (
        <details className="mb-2">
          <summary className="text-xs font-semibold text-grey-700 cursor-pointer">
            기타 차단 {otherBlocked.length}건
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {otherBlocked.slice(0, 5).map((t) => (
              <li key={t.programId} className="text-grey-600">
                <span className="text-grey-900">{t.programTitle}</span>
                <span className="ml-1 text-grey-500">
                  ({BLOCK_REASON_LABEL[t.blockReason]})
                </span>
              </li>
            ))}
            {otherBlocked.length > 5 && (
              <li className="text-grey-500">
                ... 외 {otherBlocked.length - 5}건
              </li>
            )}
          </ul>
        </details>
      )}

      {shownTraces.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-blue-700 cursor-pointer">
            노출 {shownTraces.length}건 (점수순)
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {shownTraces.slice(0, 5).map((t) => (
              <li key={t.programId} className="text-grey-600">
                <span className="text-grey-900 font-medium">
                  {t.programTitle}
                </span>
                <span className="ml-1 text-blue-700 font-semibold tabular-nums">
                  {t.score}점
                </span>
                <span className="ml-1 text-grey-500">
                  ({t.signals.map((s) => `${s.kind}+${s.score}`).join(", ")})
                </span>
              </li>
            ))}
            {shownTraces.length > 5 && (
              <li className="text-grey-500">
                ... 외 {shownTraces.length - 5}건
              </li>
            )}
          </ul>
        </details>
      )}
    </article>
  );
}

function formatSignalsHuman(s: UserSignals): string {
  const parts: string[] = [];
  if (s.ageGroup) parts.push(s.ageGroup);
  if (s.region) parts.push(s.region);
  if (s.occupation) parts.push(s.occupation);
  if (s.householdTypes.length > 0)
    parts.push(`[${s.householdTypes.join(", ")}]`);
  if (s.incomeLevel) parts.push(`소득 ${s.incomeLevel}`);
  if (s.merit === "merit") parts.push("보훈");
  return parts.join(" · ") || "신호 없음";
}
