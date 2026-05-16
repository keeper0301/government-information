// ============================================================
// 시·군 카드 (client component) — 1 클릭 수동 호출 + 최근 결과 표시
// ============================================================

"use client";

import { useState, useTransition } from "react";
import { scrapeCityAction, type CityKey } from "./actions";

type RecentRun = {
  ministry: string;
  trigger: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  createdAt: string;
};

type Props = {
  city: CityKey;
  cityLabel: string;
  siteUrl: string;
  ministry: string;
  stats: { recent: RecentRun | null; total: number } | undefined;
};

export function ScrapeCityCard({
  city,
  cityLabel,
  siteUrl,
  ministry,
  stats,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    setErrorMsg(null);
    startTransition(async () => {
      const res = await scrapeCityAction(city, 10);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      const r = res.result;
      if (r) {
        setMessage(
          `수집 ${r.inserted}건 · 중복 skip ${r.skipped}건${
            r.errors.length > 0 ? ` · 오류 ${r.errors.length}건` : ""
          }`,
        );
      }
    });
  }

  const recent = stats?.recent;
  const total = stats?.total ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{cityLabel}</h2>
          <code className="text-xs text-slate-500">{ministry}</code>
        </div>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          시청 사이트 ↗
        </a>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">누적 수집</div>
          <div className="font-medium">{total}건</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">최근 수집</div>
          <div className="font-medium">
            {recent
              ? new Date(recent.createdAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "기록 없음"}
          </div>
        </div>
      </div>

      {recent && (
        <div className="mb-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <div>
            <span className="font-semibold">{recent.trigger}</span>
            {" · fetched "}
            {recent.fetched}건 / inserted {recent.inserted}건 / skipped{" "}
            {recent.skipped}건
          </div>
          {recent.errors.length > 0 && (
            <div className="mt-1 text-amber-700">
              오류: {recent.errors.slice(0, 2).join(", ")}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "수집 중…" : "지금 수집 (최대 10건)"}
      </button>

      {message && (
        <p className="mt-2 rounded bg-green-50 px-3 py-2 text-xs text-green-800">
          ✓ {message}
        </p>
      )}
      {errorMsg && (
        <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-800">
          ✗ {errorMsg}
        </p>
      )}
    </section>
  );
}
