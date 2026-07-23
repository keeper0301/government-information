import { describe, expect, it } from "vitest";
import {
  buildMunicipalityCoverageRows,
  buildMunicipalityCoverageSummary,
} from "@/app/admin/scrape-local/municipality-coverage";
import {
  buildMunicipalityCoverageCsv,
  buildUncoveredProvinceSummary,
  buildUncoveredMunicipalityText,
} from "@/app/admin/scrape-local/municipality-coverage-export";
import { DISTRICTS_BY_PROVINCE, PROVINCES } from "@/lib/regions";

describe("scrape-local municipality coverage", () => {
  it("대한민국 행정구역 마스터의 모든 시·군·구를 빠짐없이 행으로 만든다", () => {
    const expectedCount = PROVINCES.reduce(
      (sum, province) => sum + (DISTRICTS_BY_PROVINCE[province.code] ?? []).length,
      0,
    );
    const rows = buildMunicipalityCoverageRows();

    expect(rows).toHaveLength(expectedCount);
    expect(new Set(rows.map((row) => row.fullName)).size).toBe(expectedCount);
    expect(rows.some((row) => row.fullName === "전라남도 순천시")).toBe(true);
    expect(rows.some((row) => row.fullName === "서울특별시 강남구")).toBe(true);
  });

  it("구현된 정적 collector와 Playwright collector를 커버리지에 반영한다", () => {
    const rows = buildMunicipalityCoverageRows();

    expect(
      rows.find((row) => row.fullName === "전라남도 순천시")?.covered,
    ).toMatchObject({ source: "static", key: "suncheon" });
    expect(
      rows.find((row) => row.fullName === "경기도 수원시")?.covered,
    ).toMatchObject({ source: "playwright", key: "suwon" });
    expect(
      rows.find((row) => row.fullName === "대전광역시 유성구")?.covered,
    ).toMatchObject({ source: "static", key: "yuseong" });
    expect(
      rows.find((row) => row.fullName === "대전광역시 동구")?.covered,
    ).toMatchObject({ source: "static", key: "donggu_daejeon" });
    expect(
      rows.find((row) => row.fullName === "대전광역시 중구")?.covered,
    ).toMatchObject({ source: "static", key: "junggu_daejeon" });
    expect(
      rows.find((row) => row.fullName === "대전광역시 대덕구")?.covered,
    ).toMatchObject({ source: "static", key: "daedeok" });
    expect(
      rows.find((row) => row.fullName === "충청남도 공주시")?.covered,
    ).toMatchObject({ source: "static", key: "gongju" });
    expect(
      rows.find((row) => row.fullName === "충청남도 보령시")?.covered,
    ).toMatchObject({ source: "static", key: "boryeong" });
    expect(
      rows.find((row) => row.fullName === "충청남도 아산시")?.covered,
    ).toMatchObject({ source: "static", key: "asan" });
    expect(
      rows.find((row) => row.fullName === "충청남도 논산시")?.covered,
    ).toMatchObject({ source: "static", key: "nonsan" });
    expect(
      rows.find((row) => row.fullName === "충청남도 계룡시")?.covered,
    ).toMatchObject({ source: "static", key: "gyeryong" });
    expect(
      rows.find((row) => row.fullName === "충청남도 당진시")?.covered,
    ).toMatchObject({ source: "static", key: "dangjin" });
    expect(
      rows.find((row) => row.fullName === "충청남도 금산군")?.covered,
    ).toMatchObject({ source: "static", key: "geumsan" });
    expect(
      rows.find((row) => row.fullName === "충청남도 부여군")?.covered,
    ).toMatchObject({ source: "static", key: "buyeo" });
    expect(
      rows.find((row) => row.fullName === "충청남도 서천군")?.covered,
    ).toMatchObject({ source: "static", key: "seocheon" });
    expect(
      rows.find((row) => row.fullName === "충청남도 청양군")?.covered,
    ).toMatchObject({ source: "static", key: "cheongyang" });
    expect(
      rows.find((row) => row.fullName === "충청남도 홍성군")?.covered,
    ).toMatchObject({ source: "static", key: "hongseong" });
    expect(
      rows.find((row) => row.fullName === "충청남도 예산군")?.covered,
    ).toMatchObject({ source: "static", key: "yesan" });
    expect(
      rows.find((row) => row.fullName === "충청남도 태안군")?.covered,
    ).toMatchObject({ source: "static", key: "taean" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 정읍시")?.covered,
    ).toMatchObject({ source: "static", key: "jeongeup" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 남원시")?.covered,
    ).toMatchObject({ source: "static", key: "namwon" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 김제시")?.covered,
    ).toMatchObject({ source: "static", key: "gimje" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 완주군")?.covered,
    ).toMatchObject({ source: "static", key: "wanju" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 진안군")?.covered,
    ).toMatchObject({ source: "static", key: "jinan" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 무주군")?.covered,
    ).toMatchObject({ source: "static", key: "muju" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 장수군")?.covered,
    ).toMatchObject({ source: "static", key: "jangsu" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 순창군")?.covered,
    ).toMatchObject({ source: "static", key: "sunchang" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 부안군")?.covered,
    ).toMatchObject({ source: "static", key: "buan" });
    expect(
      rows.find((row) => row.fullName === "전북특별자치도 고창군")?.covered,
    ).toMatchObject({ source: "static", key: "gochang" });
    expect(
      rows.find((row) => row.fullName === "전라남도 나주시")?.covered,
    ).toMatchObject({ source: "static", key: "naju" });
    expect(
      rows.find((row) => row.fullName === "전라남도 담양군")?.covered,
    ).toMatchObject({ source: "static", key: "damyang" });
    expect(
      rows.find((row) => row.fullName === "전라남도 구례군")?.covered,
    ).toMatchObject({ source: "static", key: "gurye" });
    expect(
      rows.find((row) => row.fullName === "전라남도 곡성군")?.covered,
    ).toMatchObject({ source: "static", key: "gokseong" });
    expect(
      rows.find((row) => row.fullName === "전라남도 고흥군")?.covered,
    ).toMatchObject({ source: "static", key: "goheung" });
    expect(
      rows.find((row) => row.fullName === "전라남도 보성군")?.covered,
    ).toMatchObject({ source: "static", key: "boseong" });
    expect(
      rows.find((row) => row.fullName === "전라남도 화순군")?.covered,
    ).toMatchObject({ source: "static", key: "hwasun" });
    expect(
      rows.find((row) => row.fullName === "전라남도 강진군")?.covered,
    ).toMatchObject({ source: "static", key: "gangjin" });
    expect(
      rows.find((row) => row.fullName === "전라남도 장흥군")?.covered,
    ).toMatchObject({ source: "static", key: "jangheung" });
    expect(
      rows.find((row) => row.fullName === "전라남도 영암군")?.covered,
    ).toMatchObject({ source: "static", key: "yeongam" });
    expect(
      rows.find((row) => row.fullName === "전라남도 무안군")?.covered,
    ).toMatchObject({ source: "static", key: "muan" });
    expect(
      rows.find((row) => row.fullName === "전라남도 영광군")?.covered,
    ).toMatchObject({ source: "static", key: "yeonggwang" });
    expect(
      rows.find((row) => row.fullName === "전라남도 장성군")?.covered,
    ).toMatchObject({ source: "static", key: "jangseong" });
    expect(
      rows.find((row) => row.fullName === "전라남도 완도군")?.covered,
    ).toMatchObject({ source: "static", key: "wando" });
    expect(
      rows.find((row) => row.fullName === "전라남도 신안군")?.covered,
    ).toMatchObject({ source: "static", key: "shinan" });
    expect(
      rows.find((row) => row.fullName === "전라남도 진도군")?.covered,
    ).toMatchObject({ source: "static", key: "jindo" });
    expect(
      rows.find((row) => row.fullName === "전라남도 해남군")?.covered,
    ).toMatchObject({ source: "static", key: "haenam" });
    expect(
      rows.find((row) => row.fullName === "충청남도 서산시")?.covered,
    ).toMatchObject({ source: "static", key: "seosan" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 강릉시")?.covered,
    ).toMatchObject({ source: "static", key: "gangneung" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 태백시")?.covered,
    ).toMatchObject({ source: "static", key: "taebaek" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 삼척시")?.covered,
    ).toMatchObject({ source: "static", key: "samcheok" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 춘천시")?.covered,
    ).toMatchObject({ source: "static", key: "chuncheon" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 홍천군")?.covered,
    ).toMatchObject({ source: "static", key: "hongcheon" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 철원군")?.covered,
    ).toMatchObject({ source: "static", key: "cheorwon" });
    expect(
      rows.find((row) => row.fullName === "강원특별자치도 동해시")?.covered,
    ).toMatchObject({ source: "static", key: "donghae" });
    expect(
      rows.find((row) => row.fullName === "충청북도 제천시")?.covered,
    ).toMatchObject({ source: "static", key: "jecheon" });
    expect(
      rows.find((row) => row.fullName === "충청북도 옥천군")?.covered,
    ).toMatchObject({ source: "static", key: "okcheon" });
    expect(
      rows.find((row) => row.fullName === "충청북도 보은군")?.covered,
    ).toMatchObject({ source: "static", key: "boeun" });
    expect(
      rows.find((row) => row.fullName === "충청북도 괴산군")?.covered,
    ).toMatchObject({ source: "static", key: "goesan" });
    expect(
      rows.find((row) => row.fullName === "충청북도 단양군")?.covered,
    ).toMatchObject({ source: "static", key: "danyang" });
    expect(
      rows.find((row) => row.fullName === "충청북도 음성군")?.covered,
    ).toMatchObject({ source: "static", key: "eumseong" });
    expect(
      rows.find((row) => row.fullName === "충청북도 진천군")?.covered,
    ).toMatchObject({ source: "static", key: "jincheon" });
    expect(
      rows.find((row) => row.fullName === "충청북도 영동군")?.covered,
    ).toMatchObject({ source: "static", key: "yeongdong" });
    expect(
      rows.find((row) => row.fullName === "충청북도 증평군")?.covered,
    ).toMatchObject({ source: "static", key: "jeungpyeong" });
  });

  it("커버리지 요약 수치가 행 상태와 일치한다", () => {
    const rows = buildMunicipalityCoverageRows();
    const summary = buildMunicipalityCoverageSummary(rows);

    expect(summary.totalCount).toBe(rows.length);
    expect(summary.coveredCount).toBe(rows.filter((row) => row.covered).length);
    expect(summary.staticCount).toBe(
      rows.filter((row) => row.covered?.source === "static").length,
    );
    expect(summary.playwrightCount).toBe(
      rows.filter((row) => row.covered?.source === "playwright").length,
    );
    expect(summary.uncoveredCount).toBe(summary.totalCount - summary.coveredCount);
  });

  it("동명 구는 광역 정보가 없는 collector 이름만으로 오매칭하지 않는다", () => {
    const rows = buildMunicipalityCoverageRows();

    const seoulJunggu = rows.find((row) => row.fullName === "서울특별시 중구");
    const busanJunggu = rows.find((row) => row.fullName === "부산광역시 중구");
    const incheonJunggu = rows.find((row) => row.fullName === "인천광역시 중구");

    expect(seoulJunggu?.covered?.key).toBe("junggu_seoul");
    // 2026-07-22: 인천 중구 static collector 는 Vercel fetch 에서 /index.html shell 만
    // 받아 stale false-positive 를 만들기 때문에 PC/Playwright 복구 전까지 미구현으로 본다.
    expect(incheonJunggu?.covered).toBeNull();
    expect(busanJunggu?.covered).toBeNull();
  });

  it("동명 자치구 collector는 광역 alias가 있을 때 해당 광역만 커버한다", () => {
    const rows = buildMunicipalityCoverageRows();

    expect(
      rows.find((row) => row.fullName === "서울특별시 강서구")?.covered,
    ).toMatchObject({ source: "static", key: "gangseo" });
    expect(
      rows.find((row) => row.fullName === "부산광역시 강서구")?.covered,
    ).toBeNull();
  });

  it("운영자가 미구현 목록과 전체 커버리지 CSV를 내보낼 수 있다", () => {
    const rows = buildMunicipalityCoverageRows();
    const uncoveredText = buildUncoveredMunicipalityText(rows);
    const csv = buildMunicipalityCoverageCsv(rows);

    expect(uncoveredText).toContain("부산광역시\t중구\t부산광역시 중구");
    expect(uncoveredText).not.toContain("전라남도\t순천시\t전라남도 순천시");
    expect(csv.split("\n")[0]).toBe(
      "provinceCode,provinceName,district,fullName,status,source,collectorKey,ministry,label",
    );
    expect(csv).toContain("jeonnam,전라남도,순천시,전라남도 순천시,covered,static,suncheon");
    expect(csv).toContain("busan,부산광역시,중구,부산광역시 중구,uncovered,,,,");
  });

  it("미구현 지역을 광역별로 많이 남은 순서로 요약한다", () => {
    const rows = buildMunicipalityCoverageRows();
    const summary = buildUncoveredProvinceSummary(rows);

    expect(summary.length).toBeGreaterThan(0);
    expect(summary.every((item) => item.uncoveredCount > 0)).toBe(true);
    expect(summary[0]?.uncoveredCount).toBeGreaterThanOrEqual(summary.at(-1)?.uncoveredCount ?? 0);

    const busan = summary.find((item) => item.provinceName === "부산광역시");
    expect(busan?.totalCount).toBe(
      rows.filter((row) => row.provinceName === "부산광역시").length,
    );
    expect(busan?.uncoveredCount).toBe(
      rows.filter((row) => row.provinceName === "부산광역시" && !row.covered).length,
    );
  });
});
