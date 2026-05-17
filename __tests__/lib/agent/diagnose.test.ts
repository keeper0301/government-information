import { describe, expect, it, vi } from "vitest";

// Supabase admin mock — 모든 query 빈 결과 (단위 테스트는 handler 분기만 검증)
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => makeChain(),
  }),
}));

// 모든 chain 메서드 self-return → resolve to { data: [], count: 0 }
function makeChain(): unknown {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "like", "order", "limit"];
  for (const m of methods) chain[m] = () => chain;
  // terminal
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: [], count: 0 });
  return chain;
}

vi.mock("@/lib/analytics/gemini-spending", () => ({
  GEMINI_KEEPIOO_CAP_KRW: 30000,
  getGeminiSpendingStats: async () => ({
    windowDays: 28,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostKrw: 0,
    monthlyProjectionKrw: 0,
  }),
}));

import { runDiagnose, listDiagnoseQuestions } from "@/lib/agent/diagnose";

describe("listDiagnoseQuestions", () => {
  it("8 question id 노출 (사전 정의)", () => {
    const list = listDiagnoseQuestions();
    expect(list).toHaveLength(8);
    expect(list).toContain("health_overview");
    expect(list).toContain("cron_recent_24h");
    expect(list).toContain("news_freshness");
    expect(list).toContain("press_tier_status");
    expect(list).toContain("llm_spending_28d");
    expect(list).toContain("sms_delivery_24h");
    expect(list).toContain("agent_recent_actions");
    expect(list).toContain("alert_recent_24h");
  });
});

describe("runDiagnose", () => {
  it("unknown question → throw", async () => {
    // @ts-expect-error 의도된 잘못된 input
    await expect(runDiagnose("unknown_xyz")).rejects.toThrow(/unknown diagnose question/);
  });

  it("정상 question → { question, data, collected_at } 반환", async () => {
    const r = await runDiagnose("health_overview");
    expect(r.question).toBe("health_overview");
    expect(r.data).toBeDefined();
    expect(r.collected_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("llm_spending_28d → cap_krw + ratio 포함 (G4 spec reuse)", async () => {
    const r = await runDiagnose("llm_spending_28d");
    const data = r.data as { cap_krw: number; ratio: number };
    expect(data.cap_krw).toBe(30000);
    expect(data.ratio).toBe(0);
  });
});
