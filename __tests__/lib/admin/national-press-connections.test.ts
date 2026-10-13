import { describe, expect, it } from "vitest";
import { buildMunicipalityCoverageRows } from "@/app/admin/scrape-local/municipality-coverage";
import { CITY_REGISTRY } from "@/lib/scraping/local-press/_registry";
import { selectPressShard } from "@/lib/scraping/local-press/_shards";

describe("전국 공식 보도자료 연결", () => {
  it("현재 지역 검색 단위 229곳에 누락된 수집기가 없다", () => {
    const rows = buildMunicipalityCoverageRows();
    expect(rows).toHaveLength(229);
    expect(rows.filter((row) => !row.covered).map((row) => row.fullName)).toEqual([]);
  });
  it("수집 등록키가 겹치지 않고 여섯 묶음에 모두 배정된다", () => {
    expect(new Set(CITY_REGISTRY.map((entry) => entry.key)).size).toBe(CITY_REGISTRY.length);
    const groups = Array.from({ length: 6 }, (_, index) => selectPressShard(CITY_REGISTRY, String(index)));
    expect(groups.flat()).toHaveLength(CITY_REGISTRY.length);
    expect(groups.every((group) => Math.ceil(group.length / 6) * 90000 < 700000)).toBe(true);
  });
});
