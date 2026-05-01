// ============================================================
// welfare/loan dedupe 알고리즘 단위 테스트 (Phase 3 Task 3 — B3)
// ============================================================
// lib/dedupe/welfare-loan.ts 의 4 signal + 종합 score 검증.
//
// 테스트 그룹:
//   1) normalizeTitle  — bracket·괄호·공백·특수문자 제거
//   2) titleSimilarity — 동일 / substring / 부분 매칭
//   3) regionMatch     — 동일 / 광역 prefix / null
//   4) applyEndMatch   — 동일 / ±7일 / 그 외
//   5) benefitTagsMatch— Jaccard 유사도
//   6) detectDuplicateScore — 같은 source_code skip / 임계 / 통합 시뮬
// ============================================================

import { describe, it, expect } from "vitest";
import {
  getDedupeSelectColumns,
  normalizeDedupeDbRow,
  normalizeTitle,
  titleSimilarity,
  regionMatch,
  applyEndMatch,
  benefitTagsMatch,
  detectDuplicateScore,
  DEDUPE_THRESHOLD,
  type DedupeRow,
} from "@/lib/dedupe/welfare-loan";

describe("dedupe DB row normalization", () => {
  it("loan_programs select 는 존재하지 않는 region 컬럼 대신 region_tags 를 조회", () => {
    expect(getDedupeSelectColumns("loan_programs")).toBe(
      "id, source_code, title, region_tags, apply_end, benefit_tags",
    );
    expect(getDedupeSelectColumns("loan_programs", { includeDuplicateOfId: true })).toBe(
      "id, source_code, title, region_tags, apply_end, benefit_tags, duplicate_of_id",
    );
  });

  it("loan_programs row 는 region_tags 를 dedupe region 문자열로 정규화", () => {
    expect(
      normalizeDedupeDbRow("loan_programs", {
        id: "loan-A",
        source_code: "mss",
        title: "[전남] 소상공인 정책자금",
        region_tags: ["전국", "전남"],
        apply_end: "2026-12-31",
        benefit_tags: ["금융"],
      }),
    ).toEqual({
      id: "loan-A",
      source_code: "mss",
      title: "[전남] 소상공인 정책자금",
      region: "전국 전남",
      apply_end: "2026-12-31",
      benefit_tags: ["금융"],
    });
  });

  it("loan_programs row 에 region_tags 가 없으면 제목 prefix 에서 지역을 추출", () => {
    expect(
      normalizeDedupeDbRow("loan_programs", {
        id: "loan-B",
        source_code: "mss",
        title: "(전라남도) 경영안정자금",
        region_tags: [],
        apply_end: null,
        benefit_tags: [],
      }).region,
    ).toBe("전라남도");
  });
});

// ──────────────────────────────────────────────────────────
// 1) normalizeTitle
// ──────────────────────────────────────────────────────────
describe("dedupe normalizeTitle", () => {
  it("[bracket prefix] 와 (괄호 내용) 모두 제거", () => {
    expect(normalizeTitle("[공고] 청년수당 (2026년)")).toBe("청년수당");
  });

  it("공백·하이픈·중점 모두 제거하고 lowercase", () => {
    expect(normalizeTitle("청년 수당 - 2026")).toBe("청년수당2026");
    expect(normalizeTitle("「복지·서비스」 안내")).toBe("복지서비스안내");
  });

  it("이미 깔끔한 제목은 그대로 (lowercase)", () => {
    expect(normalizeTitle("ABC지원")).toBe("abc지원");
  });
});

// ──────────────────────────────────────────────────────────
// 2) titleSimilarity
// ──────────────────────────────────────────────────────────
describe("dedupe titleSimilarity", () => {
  it("동일 제목 1.0", () => {
    expect(titleSimilarity("청년수당", "청년수당")).toBe(1);
  });

  it("정규화 후 동일하면 1.0 (bracket·공백 차이 무시)", () => {
    expect(titleSimilarity("[공고] 청년수당", "청년 수당")).toBe(1);
  });

  it("짧은 쪽이 긴 쪽에 그대로 포함되면 0.85", () => {
    // "청년수당" 이 "청년수당지원사업" 안에 포함
    expect(titleSimilarity("청년수당", "청년수당 지원사업")).toBeCloseTo(0.85);
  });

  it("부분 매칭 — 4글자 substring 공통이 있으면 0~1 비율", () => {
    // "청년수당지원사업" vs "청년수당안내" — 정규화 후 짧은 쪽 '청년수당안내'(6) 가
    // 긴 쪽 '청년수당지원사업'(8) 에 substring 으로 들어가지 않으므로 4글자 윈도우
    // 비교로 떨어짐. 4글자 공통: '청년수당' 1개 / 가능한 윈도우 3개 → 1/3.
    const v = titleSimilarity("청년수당지원사업", "청년수당안내");
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.85);
  });

  it("빈 제목 한 쪽이라도 있으면 0", () => {
    expect(titleSimilarity("", "청년수당")).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// 3) regionMatch
// ──────────────────────────────────────────────────────────
describe("dedupe regionMatch", () => {
  it("정확히 같은 지역 1.0", () => {
    expect(regionMatch("서울특별시", "서울특별시")).toBe(1);
  });

  it("광역 prefix 만 같으면 0.5 (전라남도 vs 전라남도 순천시)", () => {
    expect(regionMatch("전라남도", "전라남도 순천시")).toBe(0.5);
  });

  it("완전히 다른 지역 0", () => {
    expect(regionMatch("서울특별시", "부산광역시")).toBe(0);
  });

  it("한쪽이라도 null 이면 0", () => {
    expect(regionMatch(null, "서울특별시")).toBe(0);
    expect(regionMatch("서울특별시", null)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// 4) applyEndMatch
// ──────────────────────────────────────────────────────────
describe("dedupe applyEndMatch", () => {
  it("같은 날짜 1.0", () => {
    expect(applyEndMatch("2026-12-31", "2026-12-31")).toBe(1);
  });

  it("±7일 이내 0.5", () => {
    expect(applyEndMatch("2026-12-31", "2026-12-25")).toBe(0.5);
    expect(applyEndMatch("2026-12-31", "2027-01-07")).toBe(0.5);
  });

  it("8일 이상 차이 0", () => {
    expect(applyEndMatch("2026-12-31", "2027-01-15")).toBe(0);
  });

  it("한쪽이라도 null 이면 0", () => {
    expect(applyEndMatch(null, "2026-12-31")).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// 5) benefitTagsMatch (Jaccard)
// ──────────────────────────────────────────────────────────
describe("dedupe benefitTagsMatch", () => {
  it("완전히 같은 태그 묶음 1.0", () => {
    expect(benefitTagsMatch(["청년", "주거"], ["청년", "주거"])).toBe(1);
  });

  it("교집합/합집합 비율 (Jaccard)", () => {
    // 교집합 1, 합집합 3 → 1/3
    expect(benefitTagsMatch(["청년", "주거"], ["청년", "취업"])).toBeCloseTo(
      1 / 3,
    );
  });

  it("교집합 0 이면 0", () => {
    expect(benefitTagsMatch(["청년"], ["노인"])).toBe(0);
  });

  it("빈 배열 / null 한쪽이라도 있으면 0", () => {
    expect(benefitTagsMatch([], ["청년"])).toBe(0);
    expect(benefitTagsMatch(null, ["청년"])).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// 6) detectDuplicateScore — 종합
// ──────────────────────────────────────────────────────────
describe("dedupe detectDuplicateScore", () => {
  // 공통 helper — 한 줄로 row 합성
  const makeRow = (override: Partial<DedupeRow> = {}): DedupeRow => ({
    id: "id-A",
    source_code: "bokjiro",
    title: "청년수당",
    region: "서울특별시",
    apply_end: "2026-12-31",
    benefit_tags: ["청년", "주거"],
    ...override,
  });

  it("같은 id 는 null (자기 자신)", () => {
    const r = makeRow();
    expect(detectDuplicateScore(r, r)).toBeNull();
  });

  it("같은 source_code 는 null (collector upsert 책임)", () => {
    const a = makeRow({ id: "id-A", source_code: "bokjiro" });
    const b = makeRow({ id: "id-B", source_code: "bokjiro" });
    expect(detectDuplicateScore(a, b)).toBeNull();
  });

  it("임계 미달이면 null (제목·지역 모두 다름)", () => {
    const a = makeRow({ id: "id-A", source_code: "bokjiro", title: "청년수당" });
    const b = makeRow({
      id: "id-B",
      source_code: "youth-v2",
      title: "노인복지바우처",
      region: "부산광역시",
      apply_end: "2027-06-30",
      benefit_tags: ["노인"],
    });
    expect(detectDuplicateScore(a, b)).toBeNull();
  });

  it("임계 통과 — 진짜 중복 정책 시뮬 (cross-source 같은 청년수당)", () => {
    // titleSimilarity = 0.85 (substring), region 1, applyEnd 1, benefitTags 0.5
    // → 0.4*0.85 + 0.2 + 0.2 + 0.1 = 0.84
    const a = makeRow({
      id: "id-A",
      source_code: "bokjiro",
      title: "청년수당",
      benefit_tags: ["청년", "주거"],
    });
    const b = makeRow({
      id: "id-B",
      source_code: "youth-v2",
      title: "청년수당 지원사업",
      benefit_tags: ["청년", "취업"],
    });
    const m = detectDuplicateScore(a, b);
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(DEDUPE_THRESHOLD);
    expect(m!.baseId).toBe("id-A");
    expect(m!.candidateId).toBe("id-B");
    expect(m!.signals.title).toBeCloseTo(0.85);
    expect(m!.signals.region).toBe(1);
    expect(m!.signals.applyEnd).toBe(1);
  });

  it("임계 통과 — 정확히 같은 제목·지역·마감 (가장 강한 신호)", () => {
    // title 1 + region 1 + applyEnd 1 + tags 1 = 1.0
    const a = makeRow({ id: "id-A", source_code: "bokjiro" });
    const b = makeRow({ id: "id-B", source_code: "youth-v2" });
    const m = detectDuplicateScore(a, b);
    expect(m).not.toBeNull();
    expect(m!.score).toBeCloseTo(1.0);
  });
});
