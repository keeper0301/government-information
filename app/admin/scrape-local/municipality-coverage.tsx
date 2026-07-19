// ============================================================
// /admin/scrape-local — 전국 시·군·구 커버리지 데이터
// ============================================================
// 대한민국 17개 광역·228개 시군구 마스터(lib/regions) 기준으로
// 현재 보도자료 collector 구현 여부를 계산한다.
//
// 실제 수집기는 정적 CITY_REGISTRY + Playwright registry 두 경로가 공존하므로
// 이 데이터는 둘을 합쳐 "구현됨 / 미구현" 상태를 만든다.
// ============================================================

import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { PLAYWRIGHT_CITY_REGISTRY } from "@/lib/scraping/local-press/_playwright-city-registry";
import {
  DISTRICTS_BY_PROVINCE,
  PROVINCE_CODE_TO_SHORT,
  PROVINCES,
  type ProvinceCode,
} from "@/lib/regions";
import { MunicipalityCoverageClient } from "./municipality-coverage-client";

type CoverageSource = "static" | "playwright";

type CoveredUnit = {
  label: string;
  key: string;
  ministry: string;
  source: CoverageSource;
  manualHref?: string;
};

export type MunicipalityRow = {
  provinceCode: ProvinceCode;
  provinceName: string;
  district: string;
  fullName: string;
  covered: CoveredUnit | null;
};

export type CoverageSummary = {
  totalCount: number;
  coveredCount: number;
  staticCount: number;
  playwrightCount: number;
  uncoveredCount: number;
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

export function buildMunicipalityCoverageSummary(
  rows: MunicipalityRow[],
): CoverageSummary {
  const coveredCount = rows.filter((row) => row.covered).length;
  const staticCount = rows.filter((row) => row.covered?.source === "static").length;
  const playwrightCount = rows.filter(
    (row) => row.covered?.source === "playwright",
  ).length;
  return {
    totalCount: rows.length,
    coveredCount,
    staticCount,
    playwrightCount,
    uncoveredCount: rows.length - coveredCount,
  };
}

export function MunicipalityCoverage() {
  const rows = buildMunicipalityCoverageRows();
  const summary = buildMunicipalityCoverageSummary(rows);
  return <MunicipalityCoverageClient rows={rows} summary={summary} />;
}
