import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as trackEvent } from "@/app/api/events/track/route";

vi.mock("@/lib/support/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

const mocks = vi.hoisted(() => ({
  adminInsert: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({ insert: mocks.adminInsert })),
    rpc: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

describe("events track beacon body", () => {
  beforeEach(() => {
    mocks.adminInsert.mockClear();
  });

  it("sendBeacon 의 text/plain JSON 도 program_id 를 유지한 채 저장한다", async () => {
    const programId = "ae7c4623-0000-4000-8000-000000000001";
    const res = await trackEvent(
      new Request("https://www.keepioo.com/api/events/track", {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({
          event_type: "apply_call_click",
          program_id: programId,
          program_table: "welfare_programs",
          source_page: `/welfare/${programId}`,
          prior_event: "apply_visit_info_view",
        }),
      }) as never,
    );

    expect(res.status).toBe(200);
    expect(mocks.adminInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "apply_call_click",
        program_id: programId,
        program_table: "welfare_programs",
        source_page: `/welfare/${programId}`,
      }),
    );
  });
});