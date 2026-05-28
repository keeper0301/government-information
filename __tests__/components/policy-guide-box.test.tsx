import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";

describe("PolicyGuideBox", () => {
  it("3 필드가 있으면 세 섹션을 모두 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox
        tips="신청 전 소득을 확인하세요"
        faq="서류 누락이 흔한 거절 사유"
        checklist="등본·계약서·소득증빙"
        category="주거"
      />,
    );
    expect(html).toContain("신청 전 소득");
    expect(html).toContain("서류 누락");
    expect(html).toContain("등본");
  });

  it("모두 null 이면 template fallback 안내를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox tips={null} faq={null} checklist={null} category="주거" />,
    );
    expect(html.length).toBeGreaterThan(50);
    expect(html).toContain("공식");
  });

  it("일부 필드만 있으면 있는 섹션만 렌더한다", () => {
    const html = renderToStaticMarkup(
      <PolicyGuideBox tips="팁만 있음" faq={null} checklist={null} />,
    );
    expect(html).toContain("팁만 있음");
  });
});
