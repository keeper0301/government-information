import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramRow } from "@/components/program-row";
import type { DisplayProgram } from "@/lib/programs";

const program: DisplayProgram = {
  id: "demo", title: "지원 사업", category: "지원금", target: "전체", description: "지원 안내",
  amount: "", source: "공식 기관", dday: null, icon: "house", type: "welfare",
  sourceCode: null, sourceUrl: null, incomeTargetLevel: null, householdTargetTags: [],
  summaryShort: null, uniqueInsight: null,
};
afterEach(() => vi.useRealTimers());
describe("목록 신청기간", () => {
  it("날짜 누락은 상시라고 표시하지 않는다", () => {
    const html = renderToStaticMarkup(<ProgramRow program={program} />);
    expect(html).toContain("기간 미확인");
    expect(html).not.toContain("상시");
  });
  it("지난 날짜는 접근성 이름과 배지 모두 마감으로 표시한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-30T15:00:00Z"));
    const html = renderToStaticMarkup(<ProgramRow program={{ ...program, applyEnd: "2026-06-30" }} />);
    expect(html).toContain('aria-label="지원 사업 · 마감');
    expect(html).toContain(">마감</span>");
    expect(html).not.toContain("상시");
    expect(html).not.toContain("기간 미확인");
  });
});
