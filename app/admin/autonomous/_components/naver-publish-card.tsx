// ============================================================
// autonomous hub — 네이버 publish 24h 카드 (5/17)
// ============================================================
// 5/13 사고 (1,734 시도 중 1,734 fail) 재발 방지. 사장님 PC runner
// (Chrome Extension or playwright) 가동 상태 + 성공률 + pending 큐 가시화.
//
// health-check 의 naver_publish_failure alert 와 다른 진단 layer
// (시각화 vs 능동 SMS) — 동시 사용 시 진단 가속.
// ============================================================

import Link from "next/link";
import type { NaverPublishStats } from "@/lib/analytics/naver-publish-stats";

function relativeTime(iso: string | null): string {
  if (!iso) return "기록 없음";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (hours < 1) return "방금";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

const STATUS_TONE: Record<NaverPublishStats["status"], string> = {
  healthy: "bg-emerald-50 border-emerald-200 text-emerald-900",
  watch: "bg-amber-50 border-amber-200 text-amber-900",
  stalled: "bg-red-50 border-red-200 text-red-900",
  idle: "bg-slate-50 border-slate-200 text-slate-700",
};

const STATUS_LABEL: Record<NaverPublishStats["status"], string> = {
  healthy: "✓ 정상",
  watch: "⚠ 관찰",
  stalled: "✗ 사고 의심",
  idle: "○ 유휴",
};

export function NaverPublishCard({ stats }: { stats: NaverPublishStats }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            📓 네이버 블로그 발행 (24h)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            사장님 PC runner (Chrome Extension / playwright) · 5/13 사고 재발 방지
          </p>
        </div>
        <Link
          href="/admin/naver-blog"
          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          큐 관리 ↗
        </Link>
      </header>

      <div className="mb-3 grid grid-cols-4 gap-2 text-sm">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] text-emerald-700">24h 성공</div>
          <div className="font-semibold text-emerald-900">
            {stats.success24h}건
          </div>
        </div>
        <div
          className={`rounded border px-3 py-2 ${
            stats.fails24h > 0
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div
            className={`text-[11px] ${stats.fails24h > 0 ? "text-amber-700" : "text-slate-600"}`}
          >
            24h 실패
          </div>
          <div
            className={`font-semibold ${stats.fails24h > 0 ? "text-amber-900" : "text-slate-900"}`}
          >
            {stats.fails24h}건
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">성공률</div>
          <div className="font-semibold text-slate-900">
            {stats.attempts24h > 0 ? `${stats.successRate24h}%` : "—"}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">발행 대기</div>
          <div className="font-semibold text-slate-900">
            {stats.pendingEligible}건
          </div>
        </div>
      </div>

      <div className="mb-3 text-xs text-slate-600">
        skipped {stats.skipped24h}건 (시간대·cap·no_cookies·disabled 등) · 마지막
        성공{" "}
        <span className="font-medium text-slate-900">
          {relativeTime(stats.lastSuccessAt)}
        </span>
      </div>

      <div
        className={`rounded border px-3 py-2.5 text-xs ${STATUS_TONE[stats.status]}`}
      >
        <div className="font-medium">
          {STATUS_LABEL[stats.status]}
          {stats.status === "stalled" &&
            ` · 성공률 ${stats.successRate24h}% (시도 ${stats.attempts24h})`}
        </div>
        {stats.status === "stalled" && (
          <p className="mt-1 opacity-90">
            5/13 사고 패턴 (Playwright IP 차단 또는 legacy runner). 사장님 PC
            Chrome Extension 가동 + cookies 유효 확인. runner='chrome-extension'
            audit details 분포 확인.
          </p>
        )}
        {stats.status === "watch" && stats.attempts24h === 0 && (
          <p className="mt-1 opacity-90">
            큐 {stats.pendingEligible}건 대기 중인데 시도 0 = 사장님 PC runner
            미가동 의심. setup-desktop.ps1 또는 Chrome Extension popup 확인.
          </p>
        )}
        {stats.status === "idle" && (
          <p className="mt-1 opacity-80">
            큐 비어있고 시도 0 = 발행할 큐가 없음 (정상). 콘텐츠 생성 후 자동 큐
            등록 대기.
          </p>
        )}
      </div>
    </section>
  );
}
