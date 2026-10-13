import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyGuideBox } from "@/components/policy/PolicyGuideBox";
import { createGuideDraft, approveGuide } from "@/lib/policy/evidence-guide";
it("검수된 설명과 원문 근거를 함께 보여준다", () => {
  const row = { title: "청년 주거", source_url: "https://www.gwgs.go.kr/notice?id=123" };
  const guide = approveGuide(row, createGuideDraft(row, { url: row.source_url, title: row.title,
    body: "지원 대상은 고성군 거주 청년입니다.", checkedAt: "2026-10-06T00:00:00Z" },
    [{ label: "대상 확인", text: "거주 조건을 먼저 확인하세요.", quote: "고성군 거주 청년" }]), "운영자");
  const html = renderToStaticMarkup(<PolicyGuideBox guide={guide} tips={null} faq={null} checklist={null} />);
  expect(html).toContain("거주 조건을 먼저"); expect(html).toContain("고성군 거주 청년");
  expect(html).toContain(row.source_url); expect(html).toContain("운영자 검수일");
});
it("검수 전에는 구체적 사실을 추정한 대체 설명을 만들지 않는다", () => {
  const html = renderToStaticMarkup(<PolicyGuideBox tips={null} faq={null} checklist={null} />);
  expect(html).toContain("검수 중"); expect(html).not.toContain("자주 묻는 거절 사유");
});
