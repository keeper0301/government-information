import { describe, expect, it } from "vitest";
import { EDITORIAL_NEWS } from "@/lib/editorial-news-data";
import { filterEditorialNews, normalizeNewsFilters, newsFilterUrl } from "@/lib/editorial-news-filters";

describe("검수 뉴스 검색과 분류", () => {
  it("제목과 자체 설명을 검색하고 여러 단어를 함께 찾는다", () => {
    expect(filterEditorialNews(EDITORIAL_NEWS, { q: "온누리 할인" })).toHaveLength(1);
    expect(filterEditorialNews(EDITORIAL_NEWS, { q: "가맹점 관리 창구" })).toHaveLength(1);
    expect(filterEditorialNews(EDITORIAL_NEWS, { q: "존재하지않는내용" })).toHaveLength(0);
  });
  it("분야와 지역을 동시에 적용하며 전국 발표를 지역 기사로 바꾸지 않는다", () => {
    expect(filterEditorialNews(EDITORIAL_NEWS, { benefit: "금융", province: "nationwide" })).toHaveLength(1);
    expect(filterEditorialNews(EDITORIAL_NEWS, { benefit: "주거" })).toHaveLength(0);
    expect(filterEditorialNews(EDITORIAL_NEWS, { province: "seoul" })).toHaveLength(0);
  });
  it("승인 목록에 없는 글을 검색 결과에 추가하지 않는다", () => {
    expect(filterEditorialNews([], { q: "온누리" })).toEqual([]);
  });
  it("잘못된 필터는 해제하고 기존 통합 지역 주소를 유지한다", () => {
    expect(normalizeNewsFilters({ benefit: "잘못된분야", province: "unknown", q: "  온누리  " })).toEqual({ q: "온누리", benefit: "", province: "" });
    expect(normalizeNewsFilters({ province: "jeonnam" }).province).toBe("jeonnam-gwangju");
  });
  it("분야를 바꿀 때 검색어와 지역을 보존한다", () => {
    const url = new URL(newsFilterUrl({ q: "온누리 할인", province: "nationwide", benefit: "금융" }, { benefit: "주거" }), "https://keepioo.com");
    expect(url.searchParams.get("q")).toBe("온누리 할인");
    expect(url.searchParams.get("province")).toBe("nationwide");
    expect(url.searchParams.get("benefit")).toBe("주거");
  });
});
