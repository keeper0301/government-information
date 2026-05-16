import { describe, expect, it } from "vitest";
import { extractBlogTrendHints } from "@/lib/blog/trend-learning";

describe("extractBlogTrendHints", () => {
  it("최근 조회 상위 글에서 카테고리·태그·제목 힌트를 만든다", () => {
    const hints = extractBlogTrendHints([
      {
        title: "청년 월세 지원 1분 확인",
        category: "청년",
        tags: ["청년", "월세", "주거"],
        view_count: 42,
      },
      {
        title: "소상공인 정책자금 신청",
        category: "소상공인",
        tags: ["소상공인", "정책자금"],
        view_count: 21,
      },
      {
        title: "청년 교통비 지원",
        category: "청년",
        tags: ["청년", "교통비"],
        view_count: 18,
      },
    ]);

    expect(hints[0]).toContain("최근 반응 카테고리");
    expect(hints[0]).toContain("청년");
    expect(hints[1]).toContain("최근 반응 태그");
    expect(hints[1]).toContain("청년");
    expect(hints[2]).toContain("최근 조회 상위 글");
    expect(hints[2]).toContain("청년 월세 지원 1분 확인");
  });

  it("조회수가 없는 행만 있으면 빈 힌트를 반환한다", () => {
    const hints = extractBlogTrendHints([
      {
        title: "조회 없음",
        category: null,
        tags: null,
        view_count: 0,
      },
    ]);

    expect(hints).toEqual([]);
  });
});
