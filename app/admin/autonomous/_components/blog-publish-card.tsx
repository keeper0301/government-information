// ============================================================
// autonomous hub — 블로그 발행 24h 카드 (5/17)
// ============================================================
// 5/15 spending cap 사고 (2.5일 무발행) 재발 방지. 사장님 매일 hub 확인 시
// 발행 정상 가동 즉시 인식 + 무발행 36h+ 시 amber warning.
// ============================================================

import Link from "next/link";
import type { BlogPublishStats } from "@/lib/analytics/blog-publish-stats";

function relativeTime(iso: string | null): string {
  if (!iso) return "기록 없음";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (hours < 1) return "방금";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

const STATUS_TONE: Record<BlogPublishStats["status"], string> = {
  healthy: "bg-emerald-50 border-emerald-200 text-emerald-900",
  watch: "bg-amber-50 border-amber-200 text-amber-900",
  stalled: "bg-red-50 border-red-200 text-red-900",
};

const STATUS_LABEL: Record<BlogPublishStats["status"], string> = {
  healthy: "✓ 정상",
  watch: "⚠ 관찰",
  stalled: "✗ 멈춤 의심",
};

export function BlogPublishCard({ stats }: { stats: BlogPublishStats }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            ✍️ 블로그 발행 (24h)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            GitHub Actions 매일 06:00 UTC · 5/15 spending cap 사고 재발 방지
          </p>
        </div>
        <Link
          href="/admin/blog"
          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          블로그 관리 ↗
        </Link>
      </header>

      <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">24h 발행</div>
          <div className="font-semibold text-slate-900">
            {stats.published24h}건
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">7d 발행</div>
          <div className="font-semibold text-slate-900">
            {stats.published7d}건
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">마지막 발행</div>
          <div className="font-semibold text-slate-900">
            {relativeTime(stats.lastPublishedAt)}
          </div>
        </div>
        {/* 2026-05-18 — 본문 평균 길이 (5/18 OpenAI 사고 학습) */}
        <div
          className={`rounded border px-3 py-2 ${
            stats.bodyStatus === "anomaly"
              ? "border-red-300 bg-red-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="text-[11px] text-slate-600">본문 평균</div>
          <div
            className={`font-semibold ${
              stats.bodyStatus === "anomaly" ? "text-red-900" : "text-slate-900"
            }`}
          >
            {stats.avgBodyChars24h !== null
              ? `${stats.avgBodyChars24h}자${stats.bodyStatus === "anomaly" ? " ⚠️" : ""}`
              : "—"}
          </div>
        </div>
      </div>

      {stats.bodyStatus === "anomaly" && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <div className="font-medium">
            ⚠️ 본문 평균 {stats.avgBodyChars24h}자 — 정상 1,700~2,800자 범위 이탈
          </div>
          <p className="mt-1 opacity-90">
            5/18 OpenAI 사고 패턴 (짧음 591~859자) 또는 AI 잡담 (김 3,000자+) 의심.
            lib/ai.ts model/maxTokens/jsonMode 확인 권장.
          </p>
        </div>
      )}

      {/* 2026-05-19 — 7일 일별 본문 평균 mini bar chart */}
      {stats.dailyBodyAvg7d.length > 0 &&
        stats.dailyBodyAvg7d.some((d) => d.avgChars > 0) && (
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] text-slate-600 mb-1">7일 일별 본문 평균 (자)</div>
            <div className="flex items-end gap-1 h-14">
              {stats.dailyBodyAvg7d.map((d) => {
                const max = 3000;
                const heightPct = Math.max(2, (d.avgChars / max) * 100);
                const isAnomaly =
                  d.avgChars > 0 && (d.avgChars < 1700 || d.avgChars > 2800);
                return (
                  <div
                    key={d.day}
                    className="flex-1 flex flex-col items-center justify-end"
                    title={`${d.day}: ${d.avgChars}자${isAnomaly ? " (이상)" : ""}`}
                  >
                    <div
                      className={`w-full rounded-sm ${
                        d.avgChars === 0
                          ? "bg-slate-200"
                          : isAnomaly
                            ? "bg-red-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      {d.day}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-slate-500">
              <span>정상 범위 1,700~2,800자 (emerald)</span>
              <span>이상 (red) · 발행 없음 (grey)</span>
            </div>
          </div>
        )}

      <div
        className={`rounded border px-3 py-2.5 text-xs ${STATUS_TONE[stats.status]}`}
      >
        <div className="font-medium">
          {STATUS_LABEL[stats.status]} ·{" "}
          {stats.hoursSinceLastPublish < 9999
            ? `마지막 발행 ${stats.hoursSinceLastPublish}h 전`
            : "발행 이력 없음"}
        </div>
        {stats.status === "stalled" && (
          <p className="mt-1 opacity-90">
            60h+ 무발행. Gemini API spending cap 확인 (Google AI Studio 콘솔)
            + GitHub Actions publish-blog workflow 최근 실행 결과 확인.
          </p>
        )}
        {stats.status === "watch" && (
          <p className="mt-1 opacity-90">
            36h+ 무발행. 다음 06:00 UTC cron 회차 가동 확인 권장.
          </p>
        )}
      </div>
    </section>
  );
}
