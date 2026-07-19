"use client";

import { useMemo, useState } from "react";
import type { ProvinceCode } from "@/lib/regions";
import { PROVINCES } from "@/lib/regions";
import type { CoverageSummary, MunicipalityRow } from "./municipality-coverage";
import {
  buildMunicipalityCoverageCsv,
  buildUncoveredProvinceSummary,
  buildUncoveredMunicipalityText,
} from "./municipality-coverage-export";

type StatusFilter = "all" | "covered" | "uncovered" | "static" | "playwright";

type Props = {
  rows: MunicipalityRow[];
  summary: CoverageSummary;
};

export function MunicipalityCoverageClient({ rows, summary }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [province, setProvince] = useState<ProvinceCode | "all">("all");
  const [exportMessage, setExportMessage] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (province !== "all" && row.provinceCode !== province) return false;
      if (status === "covered" && !row.covered) return false;
      if (status === "uncovered" && row.covered) return false;
      if (status === "static" && row.covered?.source !== "static") return false;
      if (status === "playwright" && row.covered?.source !== "playwright") return false;
      if (!q) return true;
      return [
        row.fullName,
        row.provinceName,
        row.district,
        row.covered?.key,
        row.covered?.ministry,
        row.covered?.label,
        row.covered?.source,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [province, query, rows, status]);

  const groupedRows = useMemo(
    () =>
      PROVINCES.map((p) => ({
        province: p,
        rows: filteredRows.filter((row) => row.provinceCode === p.code),
        total: rows.filter((row) => row.provinceCode === p.code).length,
      })),
    [filteredRows, rows],
  );
  const uncoveredProvinceSummary = useMemo(() => buildUncoveredProvinceSummary(rows), [rows]);

  const coveragePercent = Math.round((summary.coveredCount / summary.totalCount) * 100);
  const filteredCoveredCount = filteredRows.filter((row) => row.covered).length;
  const filteredCoveragePercent =
    filteredRows.length > 0
      ? Math.round((filteredCoveredCount / filteredRows.length) * 100)
      : 0;
  const hasActiveFilters = query.trim() !== "" || status !== "all" || province !== "all";

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setProvince("all");
    setExportMessage("");
  }

  async function copyUncoveredList() {
    const text = buildUncoveredMunicipalityText(filteredRows);
    const uncoveredCount = filteredRows.filter((row) => !row.covered).length;
    const copied = await copyTextToClipboard(text);
    setExportMessage(
      copied
        ? `현재 표시 기준 미구현 ${uncoveredCount}곳을 복사했습니다.`
        : `브라우저 권한 때문에 자동 복사하지 못했습니다. 미구현 ${uncoveredCount}곳은 CSV 다운로드로 내보내세요.`,
    );
  }

  function downloadCoverageCsv() {
    const csv = buildMunicipalityCoverageCsv(filteredRows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scrape-local-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportMessage(`현재 표시 ${filteredRows.length}곳의 CSV를 다운로드했습니다.`);
  }

  function focusUncoveredProvince(provinceCode: ProvinceCode) {
    setProvince(provinceCode);
    setStatus("uncovered");
    setQuery("");
    setExportMessage("");
  }

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            전국 시·군·구 구현 현황
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            대한민국 전체 {summary.totalCount}개 시·군·구 기준 커버리지
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            행정구역 마스터(<code>lib/regions.ts</code>)와 보도자료 수집기 등록부를
            대조해 구현됨/미구현을 한 번에 확인합니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <Metric label="전체" value={`${summary.totalCount}곳`} />
          <Metric label="구현" value={`${summary.coveredCount}곳`} tone="good" />
          <Metric label="정적" value={`${summary.staticCount}곳`} />
          <Metric label="미구현" value={`${summary.uncoveredCount}곳`} tone="warn" />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">구현률 {coveragePercent}%</span>
          <span>
            현재 표시 {filteredRows.length.toLocaleString()} / {summary.totalCount.toLocaleString()}곳
            {hasActiveFilters && ` · 표시 구현률 ${filteredCoveragePercent}%`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${coveragePercent}%` }}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_180px_120px]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">검색</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 순천, 강남, suwon, Playwright"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">상태</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            >
              <option value="all">전체</option>
              <option value="covered">구현만</option>
              <option value="uncovered">미구현만</option>
              <option value="static">정적만</option>
              <option value="playwright">Playwright만</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">광역</span>
            <select
              value={province}
              onChange={(event) => setProvince(event.target.value as ProvinceCode | "all")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            >
              <option value="all">전체 광역</option>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              초기화
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="text-slate-600">
            <span className="font-semibold text-slate-800">운영 처리용</span>{" "}
            현재 필터 기준 미구현 {filteredRows.filter((row) => !row.covered).length.toLocaleString()}곳을
            복사하거나 전체 상태를 CSV로 내보냅니다.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyUncoveredList}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:brightness-95"
            >
              미구현 목록 복사
            </button>
            <button
              type="button"
              onClick={downloadCoverageCsv}
              className="rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              현재 목록 CSV 다운로드
            </button>
          </div>
        </div>
        {exportMessage && (
          <p className="mt-2 text-xs font-medium text-blue-700" role="status">
            {exportMessage}
          </p>
        )}

        {uncoveredProvinceSummary.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-900">미구현 많은 광역 빠른 보기</p>
                <p className="text-xs text-amber-800">
                  버튼을 누르면 해당 광역의 미구현 시·군·구만 바로 필터링합니다.
                </p>
              </div>
              <span className="text-xs text-amber-800">
                미구현 광역 {uncoveredProvinceSummary.length.toLocaleString()}곳
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {uncoveredProvinceSummary.slice(0, 8).map((item) => (
                <button
                  key={item.provinceCode}
                  type="button"
                  onClick={() => focusUncoveredProvince(item.provinceCode)}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  title={`${item.provinceName} 전체 ${item.totalCount}곳 중 미구현 ${item.uncoveredCount}곳`}
                >
                  {item.provinceName} {item.uncoveredCount}곳
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groupedRows.map(({ province: p, rows: provinceRows, total }) => {
          if (total === 0 && (province === "all" || province === p.code)) {
            return (
              <ProvinceBlock
                key={p.code}
                provinceName={p.name}
                rows={[]}
                total={0}
                note="광역=기초 통합 지역이라 별도 시·군·구 목록 없음"
              />
            );
          }
          if (provinceRows.length === 0) return null;
          return (
            <ProvinceBlock
              key={p.code}
              provinceName={p.name}
              rows={provinceRows}
              total={total}
            />
          );
        })}
      </div>

      {filteredRows.length === 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          조건에 맞는 시·군·구가 없습니다. 검색어나 필터를 조정하세요.
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        기준: 프로젝트 내 행정구역 마스터 17개 광역·시도 / 시·군·구 목록.
        “정적”은 이 페이지에서 즉시 수동 수집 가능, “Playwright”는 별도 batch/PC runner
        경로로 수집되는 지역입니다. 미구현 지역은 collector 파일을 추가해야 실제 수집됩니다.
        Playwright 경로 구현 수: {summary.playwrightCount}곳.
      </p>
    </section>
  );
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Headless browsers and some admin desktop contexts can deny the async
    // clipboard API even on HTTPS. Keep the UI useful by attempting the
    // legacy selection path before falling back to CSV-only guidance.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.append(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function ProvinceBlock({
  provinceName,
  rows,
  total,
  note,
}: {
  provinceName: string;
  rows: MunicipalityRow[];
  total: number;
  note?: string;
}) {
  const covered = rows.filter((row) => row.covered).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{provinceName}</h3>
        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
          {total === 0 ? "광역 통합" : `${covered}/${total} 구현`}
        </span>
      </div>
      {note ? (
        <p className="text-sm text-slate-500">{note}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <MunicipalityBadge key={row.fullName} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function MunicipalityBadge({ row }: { row: MunicipalityRow }) {
  const covered = row.covered;
  if (!covered) {
    return (
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
        {row.district}
        <span className="ml-1 text-slate-400">미구현</span>
      </span>
    );
  }

  const className =
    covered.source === "static"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-indigo-200 bg-indigo-50 text-indigo-900";
  const body = (
    <>
      {row.district}
      <span className="ml-1 opacity-70">
        {covered.source === "static" ? "정적" : "Playwright"}
      </span>
    </>
  );

  if (covered.manualHref) {
    return (
      <a
        href={covered.manualHref}
        title={`${covered.ministry} 수동 수집 카드로 이동`}
        className={`rounded-full border px-2.5 py-1 text-xs hover:brightness-95 ${className}`}
      >
        {body}
      </a>
    );
  }

  return (
    <span
      title={`${covered.ministry} · ${covered.key}`}
      className={`rounded-full border px-2.5 py-1 text-xs ${className}`}
    >
      {body}
    </span>
  );
}
