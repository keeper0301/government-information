import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// supabase admin client mock — audit count 분기 검증
const mockState = {
  securityCount: 0,
  renderCount: 0,
  naverCount: 0,
  residentCycleCount: 0,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, action: string) => {
          // 2026-05-19 — render plan 체크 + agent-resident-cycle 가동 체크
          const baseResult = Promise.resolve({ count: countFor(action) });
          return Object.assign(baseResult, {
            gte: () => ({
              filter: () =>
                Promise.resolve({ count: mockState.residentCycleCount }),
            }),
          });
        },
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
    mockState.residentCycleCount = 0;
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

  // 2026-05-19 review 권고 #3 — residentCycleActive=true 시 Render label 분기
  it("residentCycleActive=true + Render 미업그레이드 → label '선택적' + free 유지 가능 message", async () => {
    mockState.residentCycleCount = 1; // in-site cron 가동 중
    const actions = await getPendingExternalActions();
    const renderAction = actions.find((a) => a.category === "infrastructure");
    expect(renderAction).toBeDefined();
    expect(renderAction?.label).toContain("선택적");
    expect(renderAction?.description).toContain("free 유지 가능");
  });

  it("residentCycleActive=false + Render 미업그레이드 → label '업그레이드' + W1 ramp-up 권장", async () => {
    mockState.residentCycleCount = 0;
    const actions = await getPendingExternalActions();
    const renderAction = actions.find((a) => a.category === "infrastructure");
    expect(renderAction).toBeDefined();
    expect(renderAction?.label).toContain("업그레이드");
    expect(renderAction?.description).toContain("W1 ramp-up");
  });
});
