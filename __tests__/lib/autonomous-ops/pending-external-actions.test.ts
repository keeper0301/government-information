import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// supabase admin client mock — audit count 분기 검증
const mockState = {
  securityCount: 0,
  renderCount: 0,
  naverCount: 0,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, action: string) =>
          Promise.resolve({ count: countFor(action) }),
        in: () => ({
          gte: () =>
            Promise.resolve({ count: mockState.naverCount }),
        }),
      }),
    }),
  }),
}));

function countFor(action: string): number {
  if (action === "security_rotation_done") return mockState.securityCount;
  if (action === "render_plan_upgraded") return mockState.renderCount;
  return 0;
}

// 모듈 import — top-level 가 아니라 mock 적용 후
import { getPendingExternalActions } from "@/lib/autonomous-ops/pending-external-actions";

describe("getPendingExternalActions — audit hide 동작", () => {
  beforeEach(() => {
    mockState.securityCount = 0;
    mockState.renderCount = 0;
    mockState.naverCount = 0;
    // env 미설정 default — Gmail OAuth reminder 노출
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("default 상태 (audit 0 + env 미설정 + Naver audit 0) → 4 카테고리 모두 노출", async () => {
    const actions = await getPendingExternalActions();
    const categories = actions.map((a) => a.category);
    expect(categories).toContain("security");
    expect(categories).toContain("infrastructure");
    expect(categories).toContain("oauth");
    expect(categories).toContain("automation");
  });

  it("security_rotation_done audit ≥ 1 → security 항목 hide", async () => {
    mockState.securityCount = 1;
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "security")).toBeUndefined();
    // 다른 항목 영향 0
    expect(actions.find((a) => a.category === "infrastructure")).toBeDefined();
  });

  it("render_plan_upgraded audit ≥ 1 → infrastructure 항목 hide", async () => {
    mockState.renderCount = 1;
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "infrastructure")).toBeUndefined();
    // 다른 항목 영향 0
    expect(actions.find((a) => a.category === "security")).toBeDefined();
  });

  it("Gmail OAuth 3 env 모두 등록 → oauth 항목 hide", async () => {
    process.env.GMAIL_CLIENT_ID = "test";
    process.env.GMAIL_CLIENT_SECRET = "test";
    process.env.GMAIL_REFRESH_TOKEN = "test";
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "oauth")).toBeUndefined();
  });

  it("Naver publish audit ≥ 1 (7일) → automation 항목 hide", async () => {
    mockState.naverCount = 1;
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "automation")).toBeUndefined();
  });

  it("모든 액션 완료 → 빈 배열", async () => {
    mockState.securityCount = 1;
    mockState.renderCount = 1;
    mockState.naverCount = 1;
    process.env.GMAIL_CLIENT_ID = "test";
    process.env.GMAIL_CLIENT_SECRET = "test";
    process.env.GMAIL_REFRESH_TOKEN = "test";
    const actions = await getPendingExternalActions();
    expect(actions).toHaveLength(0);
  });
});
