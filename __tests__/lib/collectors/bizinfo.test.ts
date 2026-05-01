// ============================================================
// 기업마당 (bizinfo) collector — 정규화 로직 단위 테스트
// ============================================================
// Phase 3 Task 1 — B1 bizinfo collector 검증.
//
// 컬렉터 함수 자체는 supabase upsert 가 묶여 있어 mock 부담이 큼.
// 그래서 순수 정규화 헬퍼 (parsePubDate / parsePeriod / parseHashTags /
// classifyTable) 만 별도 export 하여 테스트.
//
// 검증 대상:
//   1) parsePubDate — pubDate 형식 다양성 (정상·짧음·null·timestamp)
//   2) parsePeriod — 신청기간 "20220727 ~ 20220930" 분해
//   3) parseHashTags — "2022,금융,충북,대전" → 표준 태그 매핑
//   4) classifyTable — lcategory / 본문 키워드로 welfare/loan 결정
// ============================================================

import { describe, it, expect } from "vitest";
import {
  parsePubDate,
  parsePeriod,
  parseHashTags,
  extractBizinfoItems,
  classifyTable,
  type BizinfoItem,
} from "@/lib/collectors/bizinfo";

// ──────────────────────────────────────────────────────────
// parsePubDate
// ──────────────────────────────────────────────────────────
describe("bizinfo parsePubDate", () => {
  it("표준 'YYYY-MM-DD HH:mm:ss' 형식 → ISO date 문자열", () => {
    expect(parsePubDate("2026-04-29 15:38:29")).toBe("2026-04-29");
  });

  it("date 만 있어도 동일 처리", () => {
    expect(parsePubDate("2025-12-01")).toBe("2025-12-01");
  });

  it("빈 문자열 / null / undefined → null (graceful)", () => {
    expect(parsePubDate(null)).toBeNull();
    expect(parsePubDate(undefined)).toBeNull();
    expect(parsePubDate("")).toBeNull();
  });

  it("형식 깨진 입력 (월/일 누락) → null", () => {
    expect(parsePubDate("2026")).toBeNull();
    expect(parsePubDate("미정")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────
// parsePeriod
// ──────────────────────────────────────────────────────────
describe("bizinfo parsePeriod", () => {
  it("'20260101 ~ 20260331' → start·end 8자리 분해", () => {
    expect(parsePeriod("20260101 ~ 20260331")).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
  });

  it("8자리 1개만 있으면 start 만 채움", () => {
    expect(parsePeriod("20260601")).toEqual({
      start: "2026-06-01",
      end: null,
    });
  });

  it("빈 문자열 / null / undefined → 둘 다 null", () => {
    expect(parsePeriod(null)).toEqual({ start: null, end: null });
    expect(parsePeriod(undefined)).toEqual({ start: null, end: null });
    expect(parsePeriod("상시")).toEqual({ start: null, end: null });
  });

  it("3개 이상의 8자리 입력 → 첫번째·마지막만 사용 (중간 무시)", () => {
    // 안내문 안에 여러 날짜가 섞여 있어도 robust.
    expect(parsePeriod("20260101 안내 20260201 ~ 20260331")).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
  });
});

// ──────────────────────────────────────────────────────────
// parseHashTags
// ──────────────────────────────────────────────────────────
describe("bizinfo parseHashTags", () => {
  it("'2026,금융,충북,대전' → region·benefit 태그 표준화", () => {
    const r = parseHashTags("2026,금융,충북,대전");
    expect(r.regionTags).toContain("충북");
    expect(r.regionTags).toContain("대전");
    expect(r.benefitTags).toContain("금융");
  });

  it("'창업,인력' → 창업·취업 매핑", () => {
    const r = parseHashTags("창업,인력");
    expect(r.benefitTags).toContain("창업");
    // '인력' 은 '취업' benefit 으로 매핑 (정책 매핑표)
    expect(r.benefitTags).toContain("취업");
  });

  it("미지원 분야는 benefit 매핑 0건", () => {
    // '기술'·'수출' 등은 benefit 표준 14종에 없어 매핑 안 됨.
    const r = parseHashTags("기술,수출");
    expect(r.benefitTags).toEqual([]);
  });

  it("빈 문자열 / null → 빈 배열 (graceful)", () => {
    const r1 = parseHashTags(null);
    expect(r1.regionTags).toEqual([]);
    expect(r1.benefitTags).toEqual([]);

    const r2 = parseHashTags("");
    expect(r2.regionTags).toEqual([]);
    expect(r2.benefitTags).toEqual([]);
  });

  it("공백 섞인 입력도 split 처리", () => {
    // "금융 창업" 처럼 공백 separator 도 지원하도록 정규식이 [,\s]+ 로 짜여 있음.
    const r = parseHashTags("금융 창업");
    expect(r.benefitTags).toContain("금융");
    expect(r.benefitTags).toContain("창업");
  });
});

// ──────────────────────────────────────────────────────────
// extractBizinfoItems
// ──────────────────────────────────────────────────────────
describe("bizinfo extractBizinfoItems", () => {
  it("현재 API 형태인 { jsonArray: [...] } 배열 응답을 items 로 읽는다", () => {
    const item: BizinfoItem = {
      pblancId: "A-1",
      pblancNm: "지원사업",
    };

    expect(extractBizinfoItems({ jsonArray: [item] })).toEqual([item]);
  });

  it("기존 { jsonArray: { item: [...] } } 형태도 계속 지원한다", () => {
    const item: BizinfoItem = {
      pblancId: "A-2",
      pblancNm: "지원사업 2",
    };

    expect(extractBizinfoItems({ jsonArray: { item: [item] } })).toEqual([item]);
  });
});

// ──────────────────────────────────────────────────────────
// classifyTable
// ──────────────────────────────────────────────────────────
describe("bizinfo classifyTable", () => {
  it("lcategory 에 '금융' 들어가면 loan", () => {
    const item: BizinfoItem = { lcategory: "금융" };
    expect(classifyTable(item)).toBe("loan");
  });

  it("본문 (title/bsnsSumryCn) 에 '대출' 키워드 → loan", () => {
    const item: BizinfoItem = {
      lcategory: "기타",
      title: "소상공인 정책자금 대출 안내",
      bsnsSumryCn: "긴급자금 대출 지원",
    };
    expect(classifyTable(item)).toBe("loan");
  });

  it("'보증' 도 loan 분류", () => {
    const item: BizinfoItem = {
      title: "신용보증재단 특례보증",
      bsnsSumryCn: "보증서 발급",
    };
    expect(classifyTable(item)).toBe("loan");
  });

  it("'융자' 도 loan 분류", () => {
    const item: BizinfoItem = {
      title: "중소기업 시설자금 융자",
      bsnsSumryCn: "장기 저리 융자",
    };
    expect(classifyTable(item)).toBe("loan");
  });

  it("loan 키워드 0건 + 비금융 분야 → welfare 기본값", () => {
    const item: BizinfoItem = {
      lcategory: "창업",
      title: "청년 창업 지원사업",
      bsnsSumryCn: "교육·멘토링 제공",
    };
    expect(classifyTable(item)).toBe("welfare");
  });
});
