import { describe, expect, it } from "vitest";
import { analyzeReadinessHtml } from "@/tools/adsense-readiness-audit.mjs";

describe("재심사 준비 점검", () => {
  it("하단 공통 문구에 출처라는 단어가 있어도 본문 검수로 인정하지 않는다", () => {
    const result = analyzeReadinessHtml('<main><h1>제목</h1><article>짧은 글</article></main><footer>공식 출처 검수 완료</footer>');
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("사람 검수 기록 없음");
    expect(result.issues).toContain("본문의 직접 공식 출처 없음");
  });
  it("정부기관 첫 화면 링크를 직접 안내의 근거로 인정하지 않는다", () => {
    const result = analyzeReadinessHtml('<main><article><a href="https://www.nts.go.kr/">국세청</a></article></main>');
    expect(result.issues).toContain("본문의 직접 공식 출처 없음");
  });
  it("승인된 공개 본문과 직접 출처를 갖춘 페이지를 구분한다", () => {
    const html = '<head><meta name="robots" content="index, follow"></head><main data-editorial-reviewer="운영자" data-editorial-reviewed-at="2026-10-05T09:00:00Z"><h1>서류 준비</h1><article><div data-guide-body="true">실제로 필요한 신청 절차 안내</div><a href="https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015">직접 안내</a></article></main>';
    expect(analyzeReadinessHtml(html, new Date("2026-10-05T10:00:00Z"))).toMatchObject({ ready: true, officialSourceCount: 1 });
  });
  it("검색 제외된 검수 대기 페이지를 준비 완료로 보고하지 않는다", () => {
    const result = analyzeReadinessHtml('<meta name="robots" content="noindex, follow"><main>편집 검수 중</main>');
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("검색 제외 또는 검색 설정 미확인");
  });
});
