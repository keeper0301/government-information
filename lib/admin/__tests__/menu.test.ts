// 어드민 사이드바 메뉴 데이터 + 활성 매칭 헬퍼 단위 테스트
// vitest run lib/admin/__tests__/menu.test.ts 로 직접 실행
import { describe, it, expect } from "vitest";
import { ADMIN_MENU, ADMIN_QUICK_ACTIONS, findActiveMenuItem } from "../menu";

describe("ADMIN_MENU 구조", () => {
  it("그룹 5개", () => {
    expect(ADMIN_MENU).toHaveLength(5);
  });

  it("그룹별 번호 1~5 순차", () => {
    expect(ADMIN_MENU.map((g) => g.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("총 페이지 메뉴 항목 34개", () => {
    // 2026-06-15 dashboard navigation 재정리: 메뉴를 5개 운영 묶음 / 32개 핵심 항목으로 압축.
    // SNS Control Tower를 대표 운영 메뉴로 추가해 핵심 항목은 33개가 됐다.
    // 유료 사용자 관리 대시보드를 고객 운영 메뉴로 추가해 현재 핵심 항목은 34개다.
    // 일부 보조 페이지는 직접 URL 접근은 유지하되 사이드바 대표 메뉴에서는 제외한다.
    const total = ADMIN_MENU.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(34);
  });

  it("href 중복 없음", () => {
    const hrefs: string[] = [];
    for (const g of ADMIN_MENU) {
      for (const i of g.items) hrefs.push(i.href);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("빠른 작업은 실제 메뉴 항목으로만 구성한다", () => {
    const menuHrefs = new Set(ADMIN_MENU.flatMap((group) => group.items.map((item) => item.href)));
    expect(ADMIN_QUICK_ACTIONS).toHaveLength(4);
    for (const item of ADMIN_QUICK_ACTIONS) {
      expect(menuHrefs.has(item.href)).toBe(true);
    }
  });
});

describe("findActiveMenuItem", () => {
  it("정확 일치 — /admin/health", () => {
    const item = findActiveMenuItem("/admin/health");
    expect(item?.href).toBe("/admin/health");
  });

  it("동적 라우트 prefix — /admin/blog/some-id-123 → /admin/blog", () => {
    // /admin/blog 메뉴가 있고, 그 하위 동적 경로는 prefix 매칭으로 잡힘
    const item = findActiveMenuItem("/admin/blog/some-id-123");
    expect(item?.href).toBe("/admin/blog");
  });

  it("대표 메뉴 prefix — /admin/news/backfill-dedupe-runner → /admin/news", () => {
    const item = findActiveMenuItem("/admin/news/backfill-dedupe-runner");
    expect(item?.href).toBe("/admin/news");
  });

  it("사용자 상세 prefix — /admin/users/{id} → /admin/users", () => {
    const item = findActiveMenuItem("/admin/users/user-id-123");
    expect(item?.href).toBe("/admin/users");
  });

  it("매칭 없음 → null", () => {
    const item = findActiveMenuItem("/admin/unknown-page");
    expect(item).toBeNull();
  });

  it("/admin (메인 대시보드) → null (메뉴 그룹 항목 외)", () => {
    const item = findActiveMenuItem("/admin");
    expect(item).toBeNull();
  });
});
