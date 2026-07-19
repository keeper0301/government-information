// ============================================================
// /admin/scrape-local — 전국 시·군·구 커버리지 패널
// ============================================================
// 대한민국 17개 광역·228개 시군구 마스터(lib/regions) 기준으로
// 현재 보도자료 collector 구현 여부를 한 화면에서 확인한다.
//
// 실제 수집기는 정적 CITY_REGISTRY + Playwright registry 두 경로가 공존하므로
// 이 패널은 둘을 합쳐 "구현됨 / 미구현" 상태를 보여주는 관리자 기능이다.
// ============================================================

import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";
import {
  DISTRICTS_BY_PROVINCE,
  PROVINCE_CODE_TO_SHORT,
  PROVINCES,
  type ProvinceCode,
} from "@/lib/regions";

type CoverageSource = "static" | "playwright";

type CoveredUnit = {
  label: string;
  key: string;
  ministry: string;
  source: CoverageSource;
  manualHref?: string;
};

type MunicipalityRow = {
  provinceCode: ProvinceCode;
  provinceName: string;
  district: string;
  fullName: string;
  covered: CoveredUnit | null;
};

function normalize(value: string) {
  return value.replace(/특례시/g, "시").replace(/청$/, "").replace(/\s+/g, "");
}

function ministryCandidates(ministry: string) {
  const normalized = normalize(ministry);
  const withoutProvinceOffice = normalized
    .replace(/특별시청$/, "특별시")
    .replace(/광역시청$/, "광역시")
    .replace(/특별자치시청$/, "특별자치시")
    .replace(/특별자치도청$/, "특별자치도")
    .replace(/도청$/, "도")
    .replace(/시청$/, "시")
    .replace(/군청$/, "군")
    .replace(/구청$/, "구");
  return [normalized, withoutProvinceOffice];
}

function makeCoverageMap() {
  const map = new Map<string, CoveredUnit>();
  const districtProvinceCount = new Map<string, number>();
  for (const province of PROVINCES) {
    for (const district of DISTRICTS_BY_PROVINCE[province.code] ?? []) {
      districtProvinceCount.set(
        district,
        (districtProvinceCount.get(district) ?? 0) + 1,
      );
    }
  }
  const put = (
    province: ProvinceCode,
    district: string,
    unit: CoveredUnit,
  ) => {
    const id = `${province}|${district}`;
    if (!map.has(id)) map.set(id, unit);
  };

  const allUnits = PROVINCES.flatMap((province) =>
    (DISTRICTS_BY_PROVINCE[province.code] ?? []).map((district) => ({
      province,
      district,
      fullName: `${province.name} ${district}`,
    })),
  );

  for (const entry of CITY_REGISTRY) {
    const candidateSet = new Set(
      [entry.city, entry.ministry, ...(entry.ministryAliases ?? [])].flatMap(
        ministryCandidates,
      ),
    );

    for (const unit of allUnits) {
      const provinceName = normalize(unit.province.name);
      const provinceNames = [
        provinceName,
        normalize(PROVINCE_CODE_TO_SHORT[unit.province.code]),
      ];
      const districtName = normalize(unit.district);
      const fullName = normalize(unit.fullName);
      const isUniqueDistrict = (districtProvinceCount.get(unit.district) ?? 0) === 1;
      const matches =
        candidateSet.has(fullName) ||
        (isUniqueDistrict && candidateSet.has(districtName));
      const provinceScopedMatch = candidatesHasProvinceAndDistrict(
        candidateSet,
        provinceNames,
        districtName,
      );
      if (matches || provinceScopedMatch) {
        put(unit.province.code, unit.district, {
          label: entry.city,
          key: entry.key,
          ministry: entry.ministry,
          source: "static",
          manualHref: `#collector-${entry.key}`,
        });
      }
    }
  }

  for (const [key, entry] of Object.entries(PLAYWRIGHT_CITY_REGISTRY)) {
    const candidateSet = new Set(ministryCandidates(entry.ministry));
    for (const unit of allUnits) {
      const provinceName = normalize(unit.province.name);
      const provinceNames = [
        provinceName,
        normalize(PROVINCE_CODE_TO_SHORT[unit.province.code]),
      ];
      const districtName = normalize(unit.district);
      const fullName = normalize(unit.fullName);
      const isUniqueDistrict = (districtProvinceCount.get(unit.district) ?? 0) === 1;
      const matches =
        candidateSet.has(fullName) ||
        (isUniqueDistrict && candidateSet.has(districtName));
      const provinceScopedMatch = candidatesHasProvinceAndDistrict(
        candidateSet,
        provinceNames,
        districtName,
      );
      if (matches || provinceScopedMatch) {
        put(unit.province.code, unit.district, {
          label: entry.sourceOutlet,
          key,
          ministry: entry.ministry,
          source: "playwright",
        });
      }
    }
  }

  return map;
}

function candidatesHasProvinceAndDistrict(
  candidates: Set<string>,
  provinceNames: string[],
  districtName: string,
) {
  for (const candidate of candidates) {
    if (
      provinceNames.some((provinceName) => candidate.includes(provinceName)) &&
      candidate.includes(districtName)
    ) {
      return true;
    }
  }
  return false;
}

export function buildMunicipalityCoverageRows(): MunicipalityRow[] {
  const coverageMap = makeCoverageMap();
  return PROVINCES.flatMap((province) =>
    (DISTRICTS_BY_PROVINCE[province.code] ?? []).map((district) => ({
      provinceCode: province.code,
      provinceName: province.name,
      district,
      fullName: `${province.name} ${district}`,
      covered: coverageMap.get(`${province.code}|${district}`) ?? null,
    })),
  );
}

export function MunicipalityCoverage() {
  const rows = buildMunicipalityCoverageRows();
  const coveredCount = rows.filter((row) => row.covered).length;
  const staticCount = rows.filter((row) => row.covered?.source === "static").length;
  const playwrightCount = rows.filter(
    (row) => row.covered?.source === "playwright",
  ).length;
  const uncoveredCount = rows.length - coveredCount;

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            전국 시·군·구 구현 현황
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            대한민국 전체 {rows.length}개 시·군·구 기준 커버리지
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            행정구역 마스터(<code>lib/regions.ts</code>)와 보도자료 수집기 등록부를
            대조해 구현됨/미구현을 한 번에 확인합니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <Metric label="전체" value={`${rows.length}곳`} />
          <Metric label="구현" value={`${coveredCount}곳`} tone="good" />
          <Metric label="정적" value={`${staticCount}곳`} />
          <Metric label="미구현" value={`${uncoveredCount}곳`} tone="warn" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {PROVINCES.map((province) => {
          const provinceRows = rows.filter(
            (row) => row.provinceCode === province.code,
          );
          if (provinceRows.length === 0) {
            return (
              <ProvinceBlock
                key={province.code}
                provinceName={province.name}
                rows={[]}
                note="광역=기초 통합 지역이라 별도 시·군·구 목록 없음"
              />
            );
          }
          return (
            <ProvinceBlock
              key={province.code}
              provinceName={province.name}
              rows={provinceRows}
            />
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        기준: 프로젝트 내 행정구역 마스터 17개 광역·시도 / 시·군·구 목록.
        “정적”은 이 페이지에서 즉시 수동 수집 가능, “Playwright”는 별도 batch/PC runner
        경로로 수집되는 지역입니다. 미구현 지역은 collector 파일을 추가해야 실제 수집됩니다.
        Playwright 경로 구현 수: {playwrightCount}곳.
      </p>
    </section>
  );
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
        : "border-slate-200 bg-slate-50 text-slate-900";
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
  note,
}: {
  provinceName: string;
  rows: MunicipalityRow[];
  note?: string;
}) {
  const covered = rows.filter((row) => row.covered).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{provinceName}</h3>
        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
          {covered}/{rows.length || 1} 구현
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
