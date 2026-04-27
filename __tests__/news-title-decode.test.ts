import { describe, it, expect } from "vitest";
import { stripHtmlTags } from "@/lib/utils";

// ============================================================
// korea.kr RSS title 디코드 회귀 가드
// ============================================================
// 사고: korea-kr.ts collector 가 title 을 디코드 안 한 채 저장 →
// 사용자 화면에 「온&middot;오프라인」「&quot;...&quot;」「한&#xFF65;베」 노출.
// stripHtmlTags 가 정상 디코드하는지 회귀 가드.
describe("뉴스 title HTML entity 디코드", () => {
  it("&middot; → · (가운뎃점)", () => {
    expect(stripHtmlTags("「고유가 피해지원금」 1차 지급 시작, 온&middot;오프라인으로 신청하세요"))
      .toBe("「고유가 피해지원금」 1차 지급 시작, 온·오프라인으로 신청하세요");
  });

  it("&quot; → \" (큰따옴표)", () => {
    expect(stripHtmlTags('지역창업 페스티벌로 &quot;모두의 창업&quot; 열풍을 이어간다'))
      .toBe('지역창업 페스티벌로 "모두의 창업" 열풍을 이어간다');
  });

  it("16진수 numeric entity &#xFF65; → ･", () => {
    const result = stripHtmlTags("한&#xFF65;베 과학기술혁신 포럼 개최");
    expect(result).not.toContain("&#x");
    expect(result).not.toContain(";");
    expect(result).toContain("한");
    expect(result).toContain("베");
  });

  it("10진수 numeric entity &#183; → ·", () => {
    expect(stripHtmlTags("온&#183;오프라인")).toBe("온·오프라인");
  });

  it("이미 디코드된 title 은 그대로 (idempotent)", () => {
    const decoded = "「고유가 피해지원금」 1차 지급 시작";
    expect(stripHtmlTags(decoded)).toBe(decoded);
  });

  it("&amp; → & 단일 처리", () => {
    expect(stripHtmlTags("AI&amp;빅데이터")).toBe("AI&빅데이터");
  });

  it("이중 인코딩 &amp;quot; → \"", () => {
    // &amp;quot; 는 1차 디코드로 &quot; → 2차 디코드로 "
    expect(stripHtmlTags("&amp;quot;테스트&amp;quot;")).toBe('"테스트"');
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(stripHtmlTags("")).toBe("");
  });

  it("null → 빈 문자열", () => {
    expect(stripHtmlTags(null)).toBe("");
  });

  it("undefined → 빈 문자열", () => {
    expect(stripHtmlTags(undefined)).toBe("");
  });

  it("script 태그 제거 (방어)", () => {
    expect(stripHtmlTags('<script>alert(1)</script>제목')).toBe("alert(1)제목");
  });

  // ━━━ 정부 보도자료 추가 entity (2026-04-28 회귀 가드) ━━━
  it("&rarr; → →", () => {
    expect(stripHtmlTags("신청 &rarr; 심사")).toBe("신청 → 심사");
  });
  it("&bull; → •", () => {
    expect(stripHtmlTags("&bull; 항목 1")).toBe("• 항목 1");
  });
  it("&sim; → ~", () => {
    expect(stripHtmlTags("9시&sim;18시")).toBe("9시~18시");
  });
  it("&times; → ×", () => {
    expect(stripHtmlTags("100&times;200")).toBe("100×200");
  });
  it("&deg; → °", () => {
    expect(stripHtmlTags("25&deg;C")).toBe("25°C");
  });
});
