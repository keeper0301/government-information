// 어드민 사이드바 메뉴 데이터 + 활성 매칭 헬퍼 단위 테스트
// vitest run lib/admin/__tests__/menu.test.ts 로 직접 실행
import { describe, it, expect } from "vitest";
import { ADMIN_MENU, findActiveMenuItem } from "../menu";

describe("ADMIN_MENU 구조", () => {
  it("그룹 5개", () => {
    expect(ADMIN_MENU).toHaveLength(5);
  });

  it("그룹별 번호 1~5 순차", () => {
    expect(ADMIN_MENU.map((g) => g.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("총 페이지 메뉴 항목 18개", () => {
    // 그룹별 합계: 5 (운영) + 6 (컨텐츠) + 2 (알림) + 3 (지표) + 2 (사용자) = 18
    // plan 문서 "페이지 19" 는 단순 합계 오류 — spec design 의 그룹별 카운트와 일치하도록 18 로 검증
    const total = ADMIN_MENU.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(18);
  });

  it("href 중복 없음", () => {
    const hrefs: string[] = [];
    for (const g of ADMIN_MENU) {
      for (const i of g.items) hrefs.push(i.href);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
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

  it("긴 prefix 우선 — /admin/news/backfill-dedupe-runner 정확 매칭", () => {
    const item = findActiveMenuItem("/admin/news/backfill-dedupe-runner");
    expect(item?.href).toBe("/admin/news/backfill-dedupe-runner");
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
