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

  it("총 페이지 메뉴 항목 33개", () => {
    // 2026-04-29 Phase 3 B3: /admin/dedupe 추가 → 운영 그룹 5→6, 총 18→19.
    // 2026-05-06: /admin/recommendation-trace 추가 → 지표 그룹 3→4, 총 19→20.
    // 2026-05-07: /admin/naver-blog, /admin/wordpress, /admin/instagram 추가 → 컨텐츠 그룹 6→9, 총 20→23.
    // 2026-05-08: /admin/ops-monitor 추가 → 운영 그룹 6→7, 총 23→24.
    // 2026-05-08 후속: ops-monitor 외 추가 페이지 누적 (Phase 4-A 큐, Phase 5-A long-tail) 23→26.
    // 2026-05-09: /admin/auto-confirmed 추가 (B안 신뢰도 tier) → 컨텐츠 그룹 9→10, 총 26→27.
    // 2026-05-10: /admin/autonomous 추가 (자율 운영 마스터 hub) → 운영 상태 그룹 7→8, 총 27→28.
    // 2026-05-12: /admin/naver-blog/cookies 추가 (Phase 2-B RPA session vault) → 컨텐츠 그룹 10→11, 총 28→29.
    // 2026-05-16: /admin/instagram/preview-categories 추가 → 컨텐츠 그룹 11→12, 총 29→30.
    // 2026-05-16: /admin/scrape-local 추가 (Phase B 시·군 보도자료 수집) → 컨텐츠 그룹 12→13, 총 30→31.
    // 2026-05-19: /admin/external-actions 추가 (사장님 외부 액션 가이드 hub) → 운영 그룹 8→9, 총 31→32.
    // 2026-05-22: /admin/decisions 추가 (사장님 결정 대기 hub) → 운영 그룹 9→10, 총 32→33.
    const total = ADMIN_MENU.reduce((s, g) => s + g.items.length, 0);
    expect(total).toBe(33);
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
