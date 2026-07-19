import type { MunicipalityRow } from "./municipality-coverage";

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
