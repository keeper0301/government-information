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
  extractSubDistrictFromFields,
} from "@/lib/region/district-extractor";
import { DISTRICTS_BY_PROVINCE, PROVINCES } from "@/lib/regions";

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

  it("광역이 있으면 접미사 없는 시군구 표현도 원래 행정구역명으로 복원", () => {
    expect(extractDistrict("전남 순천 청년 정책")?.district).toBe("순천시");
    expect(extractDistrict("부산 부산진 보도자료")?.district).toBe("부산진구");
    expect(extractDistrict("강원 평창 농업 지원")?.district).toBe("평창군");
  });

  it("대한민국 17개 광역·시도 228개 시군구의 접미사 생략 매칭을 지원", () => {
    let covered = 0;
    for (const province of PROVINCES) {
      for (const district of DISTRICTS_BY_PROVINCE[province.code] ?? []) {
        const short = district.replace(/[시군구]$/, "");
        if (short.length < 2 || short === district) continue;
        covered += 1;
        const match = extractDistrict(`${province.name} ${short} 청년 지원`);
        expect(match).toMatchObject({
          province: province.code,
          provinceName: province.name,
          district,
        });
      }
    }
    expect(covered).toBeGreaterThan(200);
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

describe("extractSubDistrictFromFields", () => {
  it("여러 필드 조합에서 시군구와 읍면동리를 함께 찾아 반환", () => {
    const match = extractSubDistrictFromFields(
      "순천시 청년 농업인 지원",
      "월등면 매월리 거주 청년 우대",
      "전라남도",
    );

    expect(match).toMatchObject({
      province: "jeonnam",
      provinceName: "전라남도",
      district: "순천시",
      subDistrict: "매월리",
      subType: "ri",
    });
  });

  it("시군구는 찾았지만 하위 행정구역이 없으면 null", () => {
    expect(
      extractSubDistrictFromFields("전라남도 순천시 청년 지원", "농업인 대상"),
    ).toBeNull();
  });
});

// ============================================================
// 2026-05-31 District Phase C — alias 확장 + false positive 회귀 안전망
// ============================================================
describe("District Phase C — 확장 alias (2026-05-31)", () => {
  it("'강원자치도 원주' → gangwon (강원특별자치도 짧은 변형)", () => {
    expect(detectProvince("강원자치도 원주시 청년 지원")).toBe("gangwon");
  });

  it("'전북자치도 전주' → jeonbuk (전북특별자치도 짧은 변형)", () => {
    expect(detectProvince("전북자치도 전주시 청년 지원")).toBe("jeonbuk");
  });

  it("'전남도 순천' → jeonnam (전라남도 변형)", () => {
    expect(detectProvince("전남도 순천시 청년 지원")).toBe("jeonnam");
  });

  it("'제주자치도' → jeju (제주특별자치도 짧은 변형)", () => {
    expect(detectProvince("제주자치도 어업 지원")).toBe("jeju");
  });
});

describe("District Phase C — 동명 자치구 정확 매칭 (false positive 0)", () => {
  it("'서울특별시 강서구' → seoul/강서구 (부산 강서구 아님)", () => {
    const m = extractDistrict("서울특별시 강서구 청년 지원");
    expect(m?.province).toBe("seoul");
    expect(m?.district).toBe("강서구");
  });

  it("'부산광역시 강서구' → busan/강서구 (서울 강서구 아님)", () => {
    const m = extractDistrict("부산광역시 강서구 청년 지원");
    expect(m?.province).toBe("busan");
    expect(m?.district).toBe("강서구");
  });

  it("'대구광역시 중구' → daegu/중구 (다른 광역 중구 아님)", () => {
    const m = extractDistrict("대구광역시 중구 청년 지원");
    expect(m?.province).toBe("daegu");
    expect(m?.district).toBe("중구");
  });

  it("'인천광역시 동구' → incheon/동구 (다른 광역 동구 아님)", () => {
    const m = extractDistrict("인천광역시 동구 청년 지원");
    expect(m?.province).toBe("incheon");
    expect(m?.district).toBe("동구");
  });
});

describe("District Phase C — 광역 없이 동명 자치구 (수도권 fallback)", () => {
  it("광역 없는 '강서구' → seoul fallback (수도권 우선)", () => {
    // PROVINCES 순서 seoul 우선 → 부산 강서구 false positive 위험 회피
    const m = extractDistrict("강서구 청년 정책 안내");
    expect(m?.province).toBe("seoul");
  });

  it("광역 없는 '중구' → seoul fallback (PROVINCES 첫 매칭)", () => {
    const m = extractDistrict("중구 청년 지원 사업");
    expect(m?.province).toBe("seoul");
  });
});

describe("District Phase C — 무관 텍스트 null 반환", () => {
  it("정책 본문 자체에 시·군 명시 없으면 null", () => {
    expect(extractDistrict("청년 정책 안내 전국 대상")).toBeNull();
  });

  it("빈 문자열·null·undefined → null", () => {
    expect(extractDistrict("")).toBeNull();
    expect(extractDistrict(null)).toBeNull();
    expect(extractDistrict(undefined)).toBeNull();
  });

  it("광역만 명시 + 시·군 없음 → extractDistrict null (광역만으론 매칭 X)", () => {
    // detectProvince 는 통과하나 extractDistrict 는 시·군 매칭이 있어야 결과 반환.
    // 정책 본문이 시·군 명시 없이 광역만 있으면 추출 실패가 정상 (전국 정책 분류).
    expect(extractDistrict("광주광역시 청년 지원")).toBeNull();
  });
});
