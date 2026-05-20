// ============================================================
// autonomous hub — AdSense placement 등록 안내 카드 (2026-05-22)
// ============================================================
// 5 placement 별 ad unit env 등록 상태 + 미등록 시 사장님 안내.
// 등록 = AdSense console 위치별 수익/CTR 분석 가능
// 미등록 = default SLOT_INFEED fallback (사이트 동작 OK, 분석만 통합)
// ============================================================

import Link from "next/link";
import type { AdsensePlacementSummary } from "@/lib/analytics/adsense-placement-status";

export function AdsensePlacementCard({
  summary,
}: {
  summary: AdsensePlacementSummary;
}) {
  const allRegistered = summary.registeredCount === summary.totalCount;
  const noneRegistered = summary.registeredCount === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            💰 AdSense 위치별 ad unit 등록
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            5 placement 분리 시 AdSense console 에서 위치별 수익·CTR 분석 가능 ·
            미등록은 default fallback (사이트 동작 OK)
          </p>
        </div>
        <Link
          href="https://adsense.google.com/adsense/u/0/pub-5310204530716694/myads"
          target="_blank"
          rel="noopener"
          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          AdSense ↗
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div
          className={`rounded border px-3 py-2 ${
            allRegistered
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="text-[11px] text-slate-600">진행률</div>
          <div className="font-semibold text-slate-900">
            {summary.registeredCount}/{summary.totalCount} 등록
          </div>
        </div>
        <div
          className={`rounded border px-3 py-2 ${
            summary.defaultFallback
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="text-[11px] text-slate-600">default fallback</div>
          <div
            className={`font-semibold ${
              summary.defaultFallback ? "text-emerald-900" : "text-red-900"
            }`}
          >
            {summary.defaultFallback ? "✅ 가동" : "❌ 광고 0"}
          </div>
        </div>
      </div>

      <div className="mb-3 space-y-1">
        {summary.placements.map((p) => {
          const ok = p.slotRegistered && p.layoutRegistered;
          const partial =
            (p.slotRegistered || p.layoutRegistered) &&
            !(p.slotRegistered && p.layoutRegistered);
          const bg = ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : partial
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-700";
          const icon = ok ? "✅" : partial ? "⚠️" : "⚪";
          return (
            <div
              key={p.placement}
              className={`flex items-center justify-between rounded border px-3 py-2 text-[13px] ${bg}`}
            >
              <div>
                <span className="mr-2">{icon}</span>
                <span className="font-medium">{p.label}</span>
                <span className="ml-2 text-[11px] opacity-75">
                  ({p.placement})
                </span>
              </div>
              <div className="text-[11px] flex gap-2">
                <span>{p.slotRegistered ? "SLOT ✓" : "SLOT ✗"}</span>
                <span>{p.layoutRegistered ? "LAYOUT ✓" : "LAYOUT ✗"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {!noneRegistered && !allRegistered && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          ⚠️ 일부 placement 만 등록 — 미등록 위치는 default fallback 사용.
          미등록 위치 ad unit 생성 후 Vercel env 추가 시 즉시 분리 가동.
        </p>
      )}

      {noneRegistered && (
        <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          💡 등록 절차: AdSense console → 광고 → 광고 단위 별 → 새 광고
          단위 (in-feed 또는 디스플레이) 5종 생성 → unit ID + layout key 를
          Vercel env 10개 (NEXT_PUBLIC_ADSENSE_SLOT_/LAYOUT_ × 5
          HOME/LIST/DETAIL/CATEGORY/ELIGIBILITY) 등록.
        </p>
      )}
    </section>
  );
}
