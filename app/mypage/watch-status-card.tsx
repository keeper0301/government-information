import Link from "next/link";
import type { MypageWatchStatus } from "@/lib/mypage/watch-status";

function toneClass(tone: MypageWatchStatus["tone"]): string {
  if (tone === "active") return "border-blue-200 bg-blue-50/70";
  if (tone === "setup") return "border-amber-200 bg-amber-50/70";
  return "border-grey-200 bg-white";
}

export function MypageWatchStatusCard({ status }: { status: MypageWatchStatus }) {
  return (
    <section className={`mb-8 rounded-2xl border p-5 shadow-sm ${toneClass(status.tone)}`}>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[12px] font-bold tracking-[0.16em] text-blue-600">
            MY POLICY WATCH
          </p>
          <h2 className="text-[19px] font-extrabold tracking-[-0.6px] text-grey-900">
            {status.headline}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.7] text-grey-700">
            {status.description}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 text-right ring-1 ring-grey-100 max-md:text-left">
          <div className="text-[12px] font-bold text-grey-500">감시 준비도</div>
          <div className="mt-1 text-[24px] font-black tracking-[-0.8px] text-blue-700">
            {status.score}/{status.total}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {status.steps.map((step) => (
          <div key={step.label} className="rounded-xl bg-white px-3 py-3 ring-1 ring-grey-100">
            <div className="flex items-center gap-2 text-[13px] font-bold text-grey-900">
              <span aria-hidden>{step.done ? "✓" : "·"}</span>
              {step.label}
            </div>
            <div className={`mt-1 text-[11px] font-semibold ${step.done ? "text-blue-600" : "text-grey-500"}`}>
              {step.done ? "완료" : "설정 필요"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={status.primaryAction.href}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-blue-700"
        >
          {status.primaryAction.label}
        </Link>
        <Link
          href={status.secondaryAction.href}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white px-5 text-[14px] font-bold text-blue-700 no-underline ring-1 ring-blue-100 transition-colors hover:bg-blue-50"
        >
          {status.secondaryAction.label}
        </Link>
      </div>
    </section>
  );
}
