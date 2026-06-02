// ============================================================
// autonomous hub — 시·군 보도자료 collector 24h 통계 카드 (5/17)
// ============================================================
// 20 시·군 cron 결과를 한눈에. inserted + error 가 시각화.
// ============================================================

import Link from "next/link";
import type { LocalPressStats } from "@/lib/analytics/local-press-stats";
import { PC_RUNNER_CFGS } from "@/lib/scraping/local-press/_pc_runner_cfgs";

// ASN 차단 site (PC runner 필요) 의 cityName set
const PC_RUNNER_CITIES = new Set(
  Object.values(PC_RUNNER_CFGS).map((c) => c.cityName),
);

function relativeMinutes(iso: string | null): string {
  if (!iso) return "—";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function LocalPressCard({ stats }: { stats: LocalPressStats }) {
  const healthyCount = stats.cities.filter(
    (c) => c.inserted24h > 0 && c.errors24h === 0,
  ).length;
  const erroredCount = stats.cities.filter((c) => c.errors24h > 0).length;
  const idleCount = stats.cities.filter(
    (c) => c.inserted24h === 0 && c.errors24h === 0,
  ).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            🗞️ 지자체 보도자료 collector
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            매일 KST 09:00 cron · {stats.cities.length} 지자체 (시·군·도·자치구) ·{" "}
            {relativeMinutes(stats.lastCronAt)}
          </p>
          {/* 2026-05-25 — PC runner (사장님 PC 한국 IP) 가동 상태. ASN 차단 site 우회.
              2026-05-26 — 48h+ stale 시 amber, 7d+ stale 시 red. 사장님 PC OFF 자가 감지. */}
          {stats.lastPcRunnerAt && (() => {
            // eslint-disable-next-line react-hooks/purity -- render 시점 경과시간 표시가 의도(매 render 현재 시각 기준 stale 판정)
            const minutes = Math.floor((Date.now() - new Date(stats.lastPcRunnerAt).getTime()) / 60000);
            const hours = minutes / 60;
            const tone = hours > 24 * 7 ? "text-red-600 font-medium" : hours > 48 ? "text-amber-700 font-medium" : "text-purple-600";
            const suffix = hours > 24 * 7 ? " · 🚨 7일+ 미가동, PC OFF 가능성" : hours > 48 ? " · ⚠️ 48h+ stale" : "";
            return (
              <p className={`mt-0.5 text-xs ${tone}`}>
                🖥️ PC runner 마지막 가동 · {relativeMinutes(stats.lastPcRunnerAt)}{suffix}
              </p>
            );
          })()}
          {!stats.lastPcRunnerAt && (
            <p className="mt-0.5 text-xs text-slate-500">
              🖥️ PC runner 아직 가동 0회 · 설치 가이드: pc-runner/README.md
            </p>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/admin/scrape-local"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            수동 호출 ↗
          </Link>
          <Link
            href="/admin/category-trends"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            📊 카테고리 추세 ↗
          </Link>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] text-emerald-700">정상</div>
          <div className="font-semibold text-emerald-900">{healthyCount}건</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[11px] text-amber-700">오류</div>
          <div className="font-semibold text-amber-900">{erroredCount}건</div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-600">유휴</div>
          <div className="font-semibold text-slate-900">{idleCount}건</div>
        </div>
      </div>

      <div className="mb-3 text-xs text-slate-600">
        24h: <span className="font-medium text-slate-900">{stats.totalInserted24h}건</span>{" "}
        등록 · fetched {stats.totalFetched24h}건 · 오류{" "}
        <span className={stats.totalErrors24h > 0 ? "text-amber-700 font-medium" : ""}>
          {stats.totalErrors24h}건
        </span>
      </div>

      {/* 2026-05-25 D3: grouping — 광역·자치구·시·군 + PC runner. 2026-05-26 PC runner group 추가. */}
      {(() => {
        // PC runner 필요 site (ASN 차단) 별도 group
        const pcRunnerCities = stats.cities.filter((c) => PC_RUNNER_CITIES.has(c.city));
        const other = stats.cities.filter((c) => !PC_RUNNER_CITIES.has(c.city));
        const groups = {
          "🖥️ PC runner 필요 (ASN 차단)": pcRunnerCities,
          광역: other.filter((c) => /(특별시|광역시|특별자치도|특별자치시|^.+도$)/.test(c.city)),
          자치구: other.filter((c) => /구$/.test(c.city) || c.city.includes(" ")),
          "시·군": other.filter((c) =>
            !/구$/.test(c.city) && !c.city.includes(" ") &&
            !/(특별시|광역시|특별자치도|특별자치시|^.+도$)/.test(c.city)
          ),
        };
        return Object.entries(groups).map(([label, cities]) => cities.length > 0 && (
          <div key={label} className="mb-3">
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center gap-2">
              <span>{label} ({cities.length})</span>
              {label.includes("PC runner") && (
                <a
                  href="https://github.com/keeper0301/government-information/blob/master/pc-runner/README.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-purple-600 hover:text-purple-800 underline"
                >
                  가이드 ↗
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
              {/* 2026-05-26 — inserted24h 순 정렬: 활성 site (insert > 0) 먼저, 다음 오류, 다음 유휴.
                  tie-break 시 city name localeCompare 으로 매번 동일 순서 보장 (사장님 검수 추적 가시성). */}
              {[...cities].sort((a, b) => {
                if (a.inserted24h !== b.inserted24h) return b.inserted24h - a.inserted24h;
                if (a.errors24h !== b.errors24h) return b.errors24h - a.errors24h;
                return a.city.localeCompare(b.city);
              }).map((c) => {
                const status = c.errors24h > 0 ? "error" : c.inserted24h > 0 ? "ok" : "idle";
                const bg = status === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : status === "error"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-slate-50 border-slate-200 text-slate-600";
                return (
                  <div
                    key={c.city}
                    className={`rounded border ${bg} px-2 py-1.5 text-xs`}
                    title={
                      c.recentErrors.length > 0
                        ? c.recentErrors.join("\n")
                        : c.nullDate24h > 0
                          ? `날짜 미상 ${c.nullDate24h}건: 본문에서 발행일 추출 실패 → 지금 시각으로 임시 기록. ${c.nullDate24h >= 5 ? "collector regex 점검 권장." : "1~2건은 자연 발생 가능."}`
                          : c.lastError ?? undefined
                    }
                  >
                    <div className="truncate font-medium">{c.city}</div>
                    <div className="text-[10px] opacity-75">
                      +{c.inserted24h}
                      {c.errors24h > 0 ? ` · 오류 ${c.errors24h}` : ""}
                      {c.nullDate24h > 0 ? ` · 날짜 미상 ${c.nullDate24h}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {erroredCount > 0 && (
        <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          오류 발생 시·군은 해당 시청 사이트 selector 변경 가능성. cron 다음 회차
          (KST 09:00) 자동 재시도. 3일 연속 실패 시 collector regex 점검 필요.
        </p>
      )}
    </section>
  );
}
