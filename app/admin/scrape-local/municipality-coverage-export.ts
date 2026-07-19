import type { MunicipalityRow } from "./municipality-coverage";

export type UncoveredProvinceSummary = {
  provinceCode: MunicipalityRow["provinceCode"];
  provinceName: string;
  totalCount: number;
  coveredCount: number;
  uncoveredCount: number;
};

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildUncoveredMunicipalityText(rows: MunicipalityRow[]) {
  const uncovered = rows.filter((row) => !row.covered);
  if (uncovered.length === 0) return "미구현 시·군·구 없음";

  return uncovered
    .map((row) => `${row.provinceName}\t${row.district}\t${row.fullName}`)
    .join("\n");
}

export function buildMunicipalityCoverageCsv(rows: MunicipalityRow[]) {
  const header = [
    "provinceCode",
    "provinceName",
    "district",
    "fullName",
    "status",
    "source",
    "collectorKey",
    "ministry",
    "label",
  ];

  const body = rows.map((row) => [
    row.provinceCode,
    row.provinceName,
    row.district,
    row.fullName,
    row.covered ? "covered" : "uncovered",
    row.covered?.source ?? "",
    row.covered?.key ?? "",
    row.covered?.ministry ?? "",
    row.covered?.label ?? "",
  ]);

  return [header, ...body]
    .map((line) => line.map(csvEscape).join(","))
    .join("\n");
}

export function buildUncoveredProvinceSummary(rows: MunicipalityRow[]) {
  const summaries = new Map<MunicipalityRow["provinceCode"], UncoveredProvinceSummary>();

  for (const row of rows) {
    const current = summaries.get(row.provinceCode) ?? {
      provinceCode: row.provinceCode,
      provinceName: row.provinceName,
      totalCount: 0,
      coveredCount: 0,
      uncoveredCount: 0,
    };

    current.totalCount += 1;
    if (row.covered) current.coveredCount += 1;
    else current.uncoveredCount += 1;
    summaries.set(row.provinceCode, current);
  }

  return [...summaries.values()]
    .filter((summary) => summary.uncoveredCount > 0)
    .sort((a, b) => b.uncoveredCount - a.uncoveredCount || a.provinceName.localeCompare(b.provinceName));
}
