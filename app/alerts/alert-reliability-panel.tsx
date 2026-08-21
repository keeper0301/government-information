import Link from "next/link";
import type { AlertReliabilitySummary } from "@/lib/alerts/reliability";

export function AlertReliabilityPanel({
  summary,
}: {
  summary: AlertReliabilitySummary;
}) {
  const percent = Math.round((summary.score / summary.total) * 100);

  return (
    <section className="mb-8 rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_8px_30px_rgba(37,99,235,0.06)]">
      <div className="flex items-start justify-between gap-5 max-md:flex-col">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[12px] font-bold tracking-[0.16em] text-blue-600">
            DEADLINE WATCH
          </p>
          <h2 className="text-[20px] font-extrabold tracking-[-0.5px] text-grey-900">
            {summary.headline}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-grey-700">
            {summary.subheadline}
          </p>
        </div>
        <div className="shrink-0 text-right max-md:w-full max-md:text-left">
          <div className="text-[28px] font-extrabold tracking-[-0.8px] text-blue-600">
            {summary.score}/{summary.total}
          </div>
          <div className="mt-1 h-2 w-32 overflow-hidden rounded-full bg-blue-50 max-md:w-full">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] font-semibold text-grey-500">
            감시 준비도 {percent}%
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {summary.steps.map((step) => (
          <div
            key={step.key}
            className={`rounded-2xl border px-4 py-3 ${
              step.done
                ? "border-emerald-100 bg-emerald-50/70"
                : "border-amber-100 bg-amber-50/70"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-black ${
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-400 text-white"
                }`}
                aria-hidden="true"
              >
                {step.done ? "✓" : "!"}
              </span>
              <p className="text-[13px] font-bold text-grey-900">{step.label}</p>
            </div>
            <p className="mt-1 pl-7 text-[12px] leading-[1.5] text-grey-600">
              {step.description}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={summary.primaryAction.href}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[14px] font-bold no-underline transition-colors ${
            summary.primaryAction.tone === "primary"
              ? "bg-blue-500 text-white hover:bg-blue-600"
              : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {summary.primaryAction.label} →
        </Link>
        <Link
          href="/recommend?from=alerts-reliability"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-grey-200 bg-white px-5 text-[14px] font-bold text-grey-700 no-underline hover:bg-grey-50"
        >
          맞춤 정책 다시 보기
        </Link>
      </div>
    </section>
  );
}
