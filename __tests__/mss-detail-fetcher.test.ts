import { describe, it, expect } from "vitest";
import { buildApplyMethod, type MssItem } from "@/lib/detail-fetchers/mss";

// ============================================================
// buildApplyMethod — 본문 정규식 + viewUrl fallback
// ============================================================
// Phase 2 핵심: 본문 placeholder 인 경우 viewUrl 로 사용자 진입 경로 보장.
describe("buildApplyMethod", () => {
  // ━━━ 본문 정규식 매칭 (Phase 1 동작) ━━━
  it("본문에 '신청방법' 헤더 → 섹션 추출", () => {
    const payload: MssItem = {
      dataContents:
        "▶ (지원대상) 중소기업\n신청방법 : 온라인 사이트에서 접수 받습니다.\n▶ 문의처: 044-1234-5678",
    };
    const result = buildApplyMethod(payload);
    expect(result).toBe("온라인 사이트에서 접수 받습니다.");
  });

  // ━━━ 본문 placeholder + viewUrl fallback (Phase 2 신규) ━━━
  it("본문 placeholder + viewUrl 있음 → fallback 안내", () => {
    const payload: MssItem = {
      dataContents: "공고합니다.",
      viewUrl: "https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=310&bcIdx=1057906",
    };
    const result = buildApplyMethod(payload);
    expect(result).toContain("공고 페이지를 참고하세요");
    expect(result).toContain("https://www.mss.go.kr");
  });

  it("본문 헤더 없음 + viewUrl null → null", () => {
    const payload: MssItem = {
      dataContents: "공고합니다.",
      viewUrl: null,
    };
    expect(buildApplyMethod(payload)).toBeNull();
  });

  it("본문 자체 null + viewUrl 있음 → fallback", () => {
    const payload: MssItem = {
      dataContents: null,
      viewUrl: "https://www.mss.go.kr/notice",
    };
    const result = buildApplyMethod(payload);
    expect(result).not.toBeNull();
    expect(result).toContain("공고 페이지를 참고하세요");
  });

  it("빈 payload → null", () => {
    expect(buildApplyMethod({})).toBeNull();
  });

  // ━━━ 우선순위: 본문 매칭이 viewUrl fallback 보다 우선 ━━━
  it("본문 매칭 + viewUrl 둘 다 있으면 본문 매칭 우선", () => {
    const payload: MssItem = {
      dataContents:
        "▶ (지원대상) 청년\n신청방법: 자체 시스템 등록\n▶ 문의처",
      viewUrl: "https://example.com",
    };
    const result = buildApplyMethod(payload);
    expect(result).toBe("자체 시스템 등록");
    expect(result).not.toContain("공고 페이지를 참고하세요");
  });

  // ━━━ viewUrl placeholder("-", "해당없음" 등) → fallback 적용 안 됨 ━━━
  it("viewUrl 가 '-' 같은 placeholder → null", () => {
    const payload: MssItem = {
      dataContents: "공고합니다.",
      viewUrl: "-",
    };
    expect(buildApplyMethod(payload)).toBeNull();
  });
});
