import { describe, expect, it } from "vitest";
import { buildAdminSearchItems, filterAdminSearchItems } from "../search";

describe("admin command palette search", () => {
  const items = buildAdminSearchItems();

  it("대시보드와 모든 사이드바 항목을 검색 대상으로 포함한다", () => {
    expect(items[0]).toMatchObject({ href: "/admin", label: "대시보드" });
    expect(items.some((item) => item.href === "/admin/naver-blog")).toBe(true);
    expect(items.some((item) => item.href === "/admin/paid-users")).toBe(true);
  });

  it("비개발자 표현으로도 자주 쓰는 페이지를 찾는다", () => {
    expect(filterAdminSearchItems(items, "크론").map((item) => item.href)).toEqual(
      expect.arrayContaining(["/admin/cron-failures", "/admin/cron-trigger"]),
    );
    expect(filterAdminSearchItems(items, "구독").map((item) => item.href)).toContain(
      "/admin/paid-users",
    );
    expect(filterAdminSearchItems(items, "크롬").map((item) => item.href)).toContain(
      "/admin/naver-blog",
    );
  });

  it("공백 query는 전체 항목을 유지한다", () => {
    expect(filterAdminSearchItems(items, "   ")).toHaveLength(items.length);
  });
});
