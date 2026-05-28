import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  generatePolicyGuide: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  update: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/admin-auth-server", () => ({
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("@/lib/policy/ai-guide", () => ({
  generatePolicyGuide: mocks.generatePolicyGuide,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        or: () => ({
          limit: async () => ({ data: mocks.rows, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.update(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { POST } from "@/app/api/admin/backfill-policy-ai-guides/route";

function request(body: unknown) {
  return new Request("https://www.keepioo.com/api/admin/backfill-policy-ai-guides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("backfill-policy-ai-guides POST", () => {
  beforeEach(() => {
    mocks.requireAdminUser.mockReset();
    mocks.generatePolicyGuide.mockReset();
    mocks.update.mockClear();
    mocks.rows = [];
  });

  it("미인증이면 401", async () => {
    mocks.requireAdminUser.mockResolvedValueOnce(null);
    const res = await POST(request({ type: "welfare", limit: 5 }));
    expect(res.status).toBe(401);
  });

  it("NULL row 를 생성 결과로 update 한다", async () => {
    mocks.requireAdminUser.mockResolvedValueOnce({ email: "admin@x.com" });
    mocks.rows = [
      { id: "p1", title: "청년 월세", summary: null, category: "주거", target: "청년" },
    ];
    mocks.generatePolicyGuide.mockResolvedValueOnce({
      tips: "팁 내용", faq: "거절 사유", checklist: "체크리스트",
    });
    const res = await POST(request({ type: "welfare", limit: 5 }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.welfare.updated).toBe(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ ai_tips: "팁 내용", ai_faq: "거절 사유", ai_checklist: "체크리스트" }),
    );
  });
});
