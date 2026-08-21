import Link from "next/link";
import type { WeeklyAlertPreview } from "@/lib/alerts/weekly-preview";

function formatDeadline(applyEnd: string | null, dday: number | null): string {
  if (!applyEnd) return "상시·확인 필요";
  if (dday === null) return applyEnd;
  if (dday < 0) return `마감 지남 · ${applyEnd}`;
  return `D-${dday} · ${applyEnd}`;
}

export function WeeklyAlertPreviewCard({ preview }: { preview: WeeklyAlertPreview }) {
  return (
    <section className="mb-8 rounded-2xl border border-grey-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-1 text-[12px] font-bold tracking-[0.16em] text-blue-600">
            WEEKLY WATCH PREVIEW
          </p>
          <h2 className="text-[21px] font-extrabold tracking-[-0.7px] text-grey-900">
            {preview.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-grey-600">
            {preview.subheadline}
          </p>
        </div>
        <div className="rounded-2xl bg-blue-50 px-5 py-4 text-right max-md:text-left">
          <div className="text-[12px] font-bold text-blue-600">{preview.metricLabel}</div>
          <div className="mt-1 text-[24px] font-black tracking-[-0.8px] text-blue-700">
            {preview.metricValue}
          </div>
        </div>
      </div>

      {preview.items.length > 0 && (
        <div className="mt-5 grid gap-3">
          {preview.items.map((item) => (
            <Link
              key={`${item.href}-${item.id}`}
              href={item.href}
              className="rounded-xl border border-grey-100 bg-grey-50 px-4 py-3 no-underline transition-colors hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="line-clamp-2 text-[15px] font-bold leading-[1.45] text-grey-900">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-grey-600">
                    {item.source}
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-blue-700 ring-1 ring-blue-100">
                  {formatDeadline(item.applyEnd, item.dday)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={preview.primaryAction.href}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-blue-700"
        >
          {preview.primaryAction.label}
        </Link>
        <span className="text-[12px] text-grey-500">
          실제 발송은 저장된 알림 조건과 수신 동의 상태를 기준으로 처리됩니다.
        </span>
      </div>
    </section>
  );
}
