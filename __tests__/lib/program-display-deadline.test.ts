import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { welfareToDisplay, loanToDisplay } from "@/lib/programs";
import type { WelfareProgram, LoanProgram } from "@/lib/database.types";
afterEach(() => vi.useRealTimers());
describe("서버 목록 마감 스냅샷", () => {
  it.each([
    ["2026-06-30T14:59:59Z", "2026-06-30", 0, false],
    ["2026-06-30T15:00:00Z", "2026-06-30", null, true],
    ["2026-06-30T15:00:00Z", null, null, false],
  ])("%s / %s", (now, apply_end, dday, isClosed) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    const source = { id: "test", title: "지원 사업", category: "지원금", source: "기관", household_target_tags: null, apply_end };
    expect(welfareToDisplay(source as WelfareProgram)).toMatchObject({ dday, isClosed });
    expect(loanToDisplay(source as LoanProgram)).toMatchObject({ dday, isClosed });
  });
});
