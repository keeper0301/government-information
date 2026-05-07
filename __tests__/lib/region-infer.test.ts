import { describe, expect, it } from "vitest";
import { inferRegionFromTitle } from "@/lib/regions";

describe("inferRegionFromTitle", () => {
  // 광역명 직접 매칭
  it("정식 광역명 명시 시 그대로 반환", () => {
    expect(inferRegionFromTitle("강원특별자치도 청년 주거 지원")).toBe("강원특별자치도");
    expect(inferRegionFromTitle("전라남도 소상공인 경영안정자금")).toBe("전라남도");
    expect(inferRegionFromTitle("서울특별시 강남구 출산 지원")).toBe("서울특별시");
  });

  // 고유 시군구 → 광역 추출 (사고 사례)
  it("속초시 (강원 고유) 명시 → 강원특별자치도 반환 (속초시 정책 사고 회귀 방지)", () => {
    expect(inferRegionFromTitle("2025 속초시 출연 소상공인 협약보증(변경)")).toBe(
      "강원특별자치도",
    );
  });

  it("순천시 (전남 고유) 명시 → 전라남도 반환", () => {
    expect(inferRegionFromTitle("순천시 청년 주거 지원")).toBe("전라남도");
  });

  it("양양군 (강원 고유) 명시 → 강원특별자치도 반환", () => {
    expect(inferRegionFromTitle("양양군 출산 지원금")).toBe("강원특별자치도");
  });

  // 동명 시군구 → null (모호)
  it("강서구 (서울/부산 동명) 명시 → null (모호)", () => {
    expect(inferRegionFromTitle("강서구 청년 정책")).toBeNull();
  });

  it("동구 (다수 광역 동명) 명시 → null", () => {
    expect(inferRegionFromTitle("동구 교육 정책")).toBeNull();
  });

  it("고성군 (강원/경남 동명) 명시 → null", () => {
    expect(inferRegionFromTitle("고성군 양육 지원")).toBeNull();
  });

  // 명시 없음
  it("title 에 광역/시군구 없으면 null", () => {
    expect(inferRegionFromTitle("재도전특별자금")).toBeNull();
    expect(inferRegionFromTitle("청년 도약 계좌")).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(inferRegionFromTitle("")).toBeNull();
  });

  // 광역명 우선순위 (광역명 + 시군구 둘 다 있어도 광역명 먼저)
  it("광역명과 시군구 둘 다 있으면 광역명 직접 매칭 우선", () => {
    expect(inferRegionFromTitle("전라남도 순천시 청년")).toBe("전라남도");
  });
});
