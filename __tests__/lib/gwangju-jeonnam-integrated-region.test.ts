import { describe, expect, it } from "vitest";
import { getDistrictsForRegion, REGION_OPTIONS } from "@/lib/profile-options";
import { getRegionMatchPatterns } from "@/lib/regions";
import {
  evaluateRegion,
  hasConflictingRegionInTitle,
} from "@/lib/personalization/score";
import { isBlogCohortFit } from "@/lib/personalization/blog-cohort";
import type { UserSignals } from "@/lib/personalization/types";

describe("전남광주통합특별시 통합 권역", () => {
  it("프로필 지역 옵션에 노출되고 광주/전남 매칭 패턴을 함께 반환한다", () => {
    expect(REGION_OPTIONS).toContain("전남광주통합특별시");
    expect(getRegionMatchPatterns("전남광주통합특별시")).toEqual([
      "전남광주통합특별시",
      "광주·전남",
      "광주전남",
      "광주광역시",
      "광주시",
      "광주",
      "전라남도",
      "전남",
    ]);
    expect(getRegionMatchPatterns("광주·전남")).toContain("전남광주통합특별시");
  });

  it("시군구 선택 목록은 광주 구 + 전남 시군을 함께 제공한다", () => {
    const districts = getDistrictsForRegion("전남광주통합특별시");
    expect(districts).toContain("광산구");
    expect(districts).toContain("순천시");
    expect(districts).toContain("목포시");
  });

  it("추천 지역 gate 에서 광주와 전남 정책을 모두 자기 권역으로 본다", () => {
    expect(evaluateRegion("광주광역시", "전남광주통합특별시", null).kind).toBe("region_only");
    expect(evaluateRegion("전라남도 순천시", "전남광주통합특별시", "순천시").kind).toBe("region_district");
    expect(evaluateRegion("서울특별시", "전남광주통합특별시", null).kind).toBe("no_match");
  });

  it("제목 충돌 안전망에서 광주/전남은 차단하지 않고 다른 광역은 차단한다", () => {
    expect(hasConflictingRegionInTitle("광주광역시 소상공인 지원", "전남광주통합특별시")).toBe(false);
    expect(hasConflictingRegionInTitle("전남 영암군 소상공인 지원", "전남광주통합특별시")).toBe(false);
    expect(hasConflictingRegionInTitle("서울특별시 소상공인 지원", "전남광주통합특별시")).toBe(true);
  });

  it("블로그 cohort 지역 gate 도 광주/전남을 같은 권역으로 처리한다", () => {
    const user: UserSignals = {
      ageGroup: "30대",
      region: "전남광주통합특별시",
      district: null,
      occupation: "자영업자",
      incomeLevel: null,
      householdTypes: [],
      benefitTags: ["창업", "금융"],
      hasChildren: null,
      merit: null,
    };

    expect(isBlogCohortFit({ category: "소상공인", title: "광주 소상공인 지원" }, user)).toBe(true);
    expect(isBlogCohortFit({ category: "소상공인", title: "전남 소상공인 지원" }, user)).toBe(true);
    expect(isBlogCohortFit({ category: "소상공인", title: "부산 소상공인 지원" }, user)).toBe(false);
  });
});
