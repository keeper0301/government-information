// ============================================================
// 시·군 자동 추출 단위 테스트
// ============================================================
// extractDistrict / detectProvince / extractDistrictFromFields 검증.
// 광역 명시 우선 + 동명 시·군 fallback 정확도 확인.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  detectProvince,
  extractDistrict,
  extractDistrictFromFields,
  extractSubDistrict,
} from "@/lib/region/district-extractor";

// ── detectProvince ──────────────────────────────────────────
describe("detectProvince", () => {
  it("'전라남도 순천시 청년 정책' → jeonnam", () => {
    expect(detectProvince("전라남도 순천시 청년 정책")).toBe("jeonnam");
  });

  it("'전남 순천시 청년 정책' → jeonnam (짧은 형태)", () => {
    expect(detectProvince("전남 순천시 청년 정책")).toBe("jeonnam");
  });

  it("'서울특별시 강서구' → seoul", () => {
    expect(detectProvince("서울특별시 강서구")).toBe("seoul");
  });

  it("'서울시 강서구' → seoul (짧은 형태)", () => {
    expect(detectProvince("서울시 강서구")).toBe("seoul");
  });

  it("'경기도 수원시' → gyeonggi", () => {
    expect(detectProvince("경기도 수원시")).toBe("gyeonggi");
  });

  it("광역 명시 없으면 null", () => {
    expect(detectProvince("청년 정책 안내")).toBeNull();
  });

  it("긴 alias 가 짧은 alias 보다 우선 (전라남도 > 전남)", () => {
    // "전라남도" 검출 시 "전남" 도 alias 라 중복 매칭 가능 — 어쨌든 jeonnam 정상
    expect(detectProvince("전라남도")).toBe("jeonnam");
  });
});

// ── extractDistrict ─────────────────────────────────────────
describe("extractDistrict — 광역 명시 (Case 1)", () => {
  it("'전라남도 순천시 청년 정책' → jeonnam + 순천시", () => {
    const match = extractDistrict("전라남도 순천시 청년 정책");
    expect(match).toEqual({
      province: "jeonnam",
      provinceName: "전라남도",
      district: "순천시",
    });
  });

  it("'전남 여수시 소상공인 보조금' → jeonnam + 여수시", () => {
    const match = extractDistrict("전남 여수시 소상공인 보조금");
    expect(match?.province).toBe("jeonnam");
    expect(match?.district).toBe("여수시");
  });

  it("'경기도 수원시 영통구 청년 사업' → gyeonggi + 수원시", () => {
    // 수원시 가 영통구 보다 행정구역 단위라 먼저 매칭
    const match = extractDistrict("경기도 수원시 영통구 청년 사업");
    expect(match?.province).toBe("gyeonggi");
    expect(match?.district).toBe("수원시");
  });
});

describe("extractDistrict — 광역 없이 시·군만 (Case 2)", () => {
  it("'순천시 청년 정책' → jeonnam + 순천시 (광역 없어도 시·군만으로 매칭)", () => {
    const match = extractDistrict("순천시 청년 정책");
    expect(match?.district).toBe("순천시");
    expect(match?.province).toBe("jeonnam");
  });

  it("'여수시 어업 지원' → jeonnam + 여수시", () => {
    const match = extractDistrict("여수시 어업 지원");
    expect(match?.district).toBe("여수시");
  });
});

describe("extractDistrict — 매치 없음", () => {
  it("광역·시·군 모두 없으면 null", () => {
    expect(extractDistrict("청년 정책 안내")).toBeNull();
  });

  it("'전국 청년 지원' → 광역 + 시·군 없음", () => {
    // "전국" 은 PROVINCE_ALIASES 에 없음. detectProvince null, district 매치도 없음.
    expect(extractDistrict("전국 청년 지원")).toBeNull();
  });

  it("null/undefined/빈 문자열 → null", () => {
    expect(extractDistrict(null)).toBeNull();
    expect(extractDistrict(undefined)).toBeNull();
    expect(extractDistrict("")).toBeNull();
  });
});

describe("extractDistrict — 동명 시·군 (Case 2 PROVINCES 순서)", () => {
  it("'강서구 청년 정책' → seoul 강서구 (수도권 우선)", () => {
    // "강서구" 가 서울·부산 둘 다 존재. PROVINCES 순서 (서울 먼저) 에 따라 seoul 매칭.
    const match = extractDistrict("강서구 청년 정책");
    expect(match?.district).toBe("강서구");
    expect(match?.province).toBe("seoul");
  });

  it("'부산 강서구 청년 정책' → busan 강서구 (광역 명시 우선)", () => {
    const match = extractDistrict("부산 강서구 청년 정책");
    expect(match?.province).toBe("busan");
    expect(match?.district).toBe("강서구");
  });
});

// ── extractDistrictFromFields (다중 필드 조합) ─────────────
describe("extractDistrictFromFields", () => {
  it("title + content 조합 — 광역 명시된 필드 우선", () => {
    const match = extractDistrictFromFields(
      "순천시 청년 정책", // 광역 없음
      "전라남도 어디", // 광역 명시
    );
    // 광역 명시 텍스트 (전라남도 어디) 우선 시도 — 단 district 매칭 없으면 다음
    expect(match?.province).toBe("jeonnam");
  });

  it("모든 필드 null/undefined → null", () => {
    expect(extractDistrictFromFields(null, undefined, "")).toBeNull();
  });

  it("title 만 매치 → 그 결과 반환", () => {
    const match = extractDistrictFromFields("순천시 청년 정책", null, null);
    expect(match?.district).toBe("순천시");
  });
});

describe("extractSubDistrict", () => {
  it("월등면 매월리처럼 면과 리가 같이 있으면 더 세부 단위인 리를 반환", () => {
    const text = "전라남도 순천시 월등면 매월리 청년 농업인 지원";
    const district = extractDistrict(text);

    expect(district?.district).toBe("순천시");
    expect(extractSubDistrict(text, district!)).toMatchObject({
      province: "jeonnam",
      district: "순천시",
      subDistrict: "매월리",
      subType: "ri",
    });
  });

  it("순천시 읍면동만 있으면 해당 하위 행정구역을 반환", () => {
    const text = "순천시 월등면 농가 지원";
    const district = extractDistrict(text);

    expect(extractSubDistrict(text, district!)).toMatchObject({
      subDistrict: "월등면",
      subType: "myeon",
    });
  });

  it("사전에 없는 시군구나 빈 텍스트는 null", () => {
    const yeosu = extractDistrict("전남 여수시 어업 지원");

    expect(extractSubDistrict("전남 여수시 돌산읍 어업 지원", yeosu!)).toBeNull();
    expect(extractSubDistrict(null, yeosu!)).toBeNull();
  });
});
