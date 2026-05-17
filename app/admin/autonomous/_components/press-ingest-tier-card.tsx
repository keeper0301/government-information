// ============================================================
// autonomous hub — press_ingest 신뢰도 tier 통계 카드 (5/17)
// ============================================================
// 1주차 모니터링 spec (memory project_press_ingest_confidence_tier_2026_05_09).
// AUTO_CONFIRM_TIER_FLOOR 튜닝 결정 데이터 + 자동 추천 hint.
// ============================================================

import Link from "next/link";
import type { PressIngestTierStats } from "@/lib/analytics/press-ingest-tier-stats";

const HINT_TONE: Record<string, string> = {
  "데이터 부족": "bg-slate-50 border-slate-200 text-slate-700",
  "관찰 중": "bg-blue-50 border-blue-200 text-blue-800",
  "LLM 정확 — 현 상태 유지":
    "bg-emerald-50 border-emerald-200 text-emerald-800",
  "LLM 보수적 — AUTO_CONFIRM_TIER_FLOOR=low 검토":
    "bg-amber-50 border-amber-200 text-amber-800",
};

export function PressIngestTierCard({
  stats,
}: {
  stats: PressIngestTierStats;
}) {
  const hintTone =
    HINT_TONE[stats.lowConfirmRateHint] ??
    "bg-slate-50 border-slate-200 text-slate-700";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            ⚙️ press_ingest 신뢰도 tier (1주차 튜닝)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            high/mid 자동 등록 + low pending 검수율 데이터로{" "}
            <code>AUTO_CONFIRM_TIER_FLOOR</code> 튜닝 결정
          </p>
        </div>
        <Link
          href="/admin/press-ingest"
          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          검수 큐 ↗
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] text-emerald-700">24h 자동 등록</div>
          <div className="font-semibold text-emerald-900">
            {stats.autoConfirm24h}건
          </div>
          <div className="text-[10px] text-emerald-700/80">
            high {stats.highCount24h} · mid {stats.midCount24h}
          </div>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="text-[11px] text-blue-700">7d 자동 등록</div>
          <div className="font-semibold text-blue-900">
            {stats.autoConfirm7d}건
          </div>
          <div className="text-[10px] text-blue-700/80">
            high {stats.highCount7d} · mid {stats.midCount7d}
          </div>
        </div>
        <div
          className={`rounded border px-3 py-2 ${
            stats.midRevokeRateWarning
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div
            className={`text-[11px] ${stats.midRevokeRateWarning ? "text-amber-800" : "text-slate-600"}`}
          >
            7d mid 회수율
          </div>
          <div
            className={`font-semibold ${stats.midRevokeRateWarning ? "text-amber-900" : "text-slate-900"}`}
          >
            {stats.midRevokeRate7d}%
          </div>
          <div className="text-[10px] opacity-75">
            {stats.midRevokeRateWarning ? "⚠ 5% 초과" : "정상 (≤5%)"}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">low pending</div>
          <div className="font-semibold text-slate-900">
            {stats.pressLowTierBacklog}건
          </div>
          <div className="text-[10px] text-slate-600/80">
            전체 pending {stats.pressPending}
          </div>
        </div>
      </div>

      <div
        className={`rounded border px-3 py-2.5 text-xs ${hintTone}`}
      >
        <div className="font-medium">
          🎯 자동 추천: {stats.lowConfirmRateHint}
        </div>
        <div className="mt-1 opacity-80">
          7d low 검수: {stats.lowConfirmed7d} confirmed /{" "}
          {stats.lowRejected7d} rejected ={" "}
          <span className="font-medium">{stats.lowConfirmRate7d}% confirm</span>
          {stats.lowConfirmed7d + stats.lowRejected7d < 5 && (
            <span className="ml-1 opacity-70">
              (≥5건 누적 후 hint 정확)
            </span>
          )}
        </div>
        {/* 5/17 G6 — 데이터 부족 + low 큐 적체 시 모바일 검수 가속 가이드 */}
        {stats.lowConfirmRateHint === "데이터 부족" && stats.pressLowTierBacklog >= 5 && (
          <p className="mt-2 text-[11px] opacity-90">
            💡 모바일에서 텔레그램 <code>/press low</code> 5건씩 검수 가능 (5/16 명령).
            {stats.pressLowTierBacklog}건 적체 — 1회 5건씩{" "}
            {Math.ceil(stats.pressLowTierBacklog / 5)}배치면 hint 정확화.
          </p>
        )}
        {stats.lowConfirmRateHint.includes("AUTO_CONFIRM_TIER_FLOOR=low") && (
          <p className="mt-2 text-[11px] opacity-90">
            Vercel env 에 <code>AUTO_CONFIRM_TIER_FLOOR=low</code> 추가 시 low
            tier 도 자동 confirm. 다만 mid 회수율 ≤ 5% 인지 먼저 확인.
          </p>
        )}
      </div>
    </section>
  );
}
