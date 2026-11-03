import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgramRow } from "@/components/program-row";
import { welfareToDisplay, type DisplayProgram } from "@/lib/programs";
import type { WelfareProgram } from "@/lib/database.types";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

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
  it("캐시된 서버 상태는 브라우저 자정 경계에서도 같은 HTML을 유지한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-30T14:59:59Z"));
    const snapshot = welfareToDisplay({ ...program, apply_end: "2026-06-30", household_target_tags: null } as unknown as WelfareProgram);
    const before = renderToStaticMarkup(<ProgramRow program={snapshot} />);
    vi.setSystemTime(new Date("2026-06-30T15:00:00Z"));
    expect(renderToStaticMarkup(<ProgramRow program={snapshot} />)).toBe(before);
  });
  it("만료된 날짜는 캐시에 남은 D-day보다 우선한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-30T15:00:00Z"));
    const html = renderToStaticMarkup(<ProgramRow program={{ ...program, isClosed: true, dday: 0 }} />);
    expect(html).toContain('aria-label="지원 사업 · 마감');
    expect(html).toContain(">마감</span>");
    expect(html).not.toContain("D-0");
  });
  it("지난 날짜는 접근성 이름과 배지 모두 마감으로 표시한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-30T15:00:00Z"));
    const html = renderToStaticMarkup(<ProgramRow program={{ ...program, isClosed: true }} />);
    expect(html).toContain('aria-label="지원 사업 · 마감');
    expect(html).toContain(">마감</span>");
    expect(html).not.toContain("상시");
    expect(html).not.toContain("기간 미확인");
  });
});
