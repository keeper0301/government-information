import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// supabase admin client mock — audit count 분기 검증
const mockState = {
  securityCount: 0,
  renderCount: 0,
  naverCount: 0,
  residentCycleCount: 0,
  tossBillingCount: 0,
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

vi.mock("@/lib/codex/w1-readiness", () => ({
  checkW1Readiness: vi.fn(async () => ({
    windowReached: false,
    totalRuns7d: 0,
    uniqueQuestions: 0,
    errorRate: 0,
    ready: false,
    reasons: [],
    daysToWindow: 1,
    progressTotalRuns: 0,
    progressUniqueQuestions: 0,
    progressErrorRate: 1,
    thresholds: {
      totalRuns: 800,
      uniqueQuestions: 10,
      errorRate: 0.05,
    },
  })),
}));

function countFor(action: string): number {
  if (action === "security_rotation_done") return mockState.securityCount;
  if (action === "render_plan_upgraded") return mockState.renderCount;
  if (action === "toss_billing_approved") return mockState.tossBillingCount;
  return 0;
}

function setAllOauthEnv() {
  process.env.GMAIL_CLIENT_ID = "test";
  process.env.GMAIL_CLIENT_SECRET = "test";
  process.env.GMAIL_REFRESH_TOKEN = "test";
  process.env.TWITTER_API_KEY = "test";
  process.env.TWITTER_API_SECRET = "test";
  process.env.TWITTER_ACCESS_TOKEN = "test";
  process.env.TWITTER_ACCESS_TOKEN_SECRET = "test";
  process.env.FACEBOOK_PAGE_ID = "test";
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test";
  process.env.THREADS_USER_ID = "test";
  process.env.THREADS_ACCESS_TOKEN = "test";
}

// 모듈 import — top-level 가 아니라 mock 적용 후
import {
  getPendingExternalActions,
  CATEGORY_META,
} from "@/lib/autonomous-ops/pending-external-actions";

describe("getPendingExternalActions — audit hide 동작", () => {
  beforeEach(() => {
    mockState.securityCount = 0;
    mockState.renderCount = 0;
    mockState.naverCount = 0;
    mockState.residentCycleCount = 0;
    mockState.tossBillingCount = 0;
    // env 미설정 default — Gmail/SNS OAuth reminder 노출
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_TOKEN_SECRET;
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.THREADS_USER_ID;
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.TOSS_SECRET_KEY;
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

  it("Gmail/SNS OAuth env 모두 등록 → oauth 항목 hide", async () => {
    setAllOauthEnv();
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "oauth")).toBeUndefined();
  });

  it("SNS OAuth 항목은 credential 재발급 guideUrl 을 제공한다", async () => {
    const actions = await getPendingExternalActions();
    const snsActions = actions.filter((a) =>
      /Twitter|Facebook|Threads/.test(a.label),
    );
    expect(snsActions).toHaveLength(3);
    for (const action of snsActions) {
      expect(action.guideUrl).toContain("sns-credential-renewal.md");
    }
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
    mockState.tossBillingCount = 1;
    setAllOauthEnv();
    const actions = await getPendingExternalActions();
    expect(actions).toHaveLength(0);
  });

  // 2026-05-19 — residentCycleActive=true 시 Render 선택 액션은 자동 종료.
  it("residentCycleActive=true + Render 미업그레이드 → infrastructure 항목 hide", async () => {
    mockState.residentCycleCount = 1; // in-site cron 가동 중
    const actions = await getPendingExternalActions();
    const renderAction = actions.find((a) => a.category === "infrastructure");
    expect(renderAction).toBeUndefined();
  });

  it("residentCycleActive=false + Render 미업그레이드 → label '업그레이드' + W1 ramp-up 권장", async () => {
    mockState.residentCycleCount = 0;
    const actions = await getPendingExternalActions();
    const renderAction = actions.find((a) => a.category === "infrastructure");
    expect(renderAction).toBeDefined();
    expect(renderAction?.label).toContain("업그레이드");
    expect(renderAction?.description).toContain("W1 ramp-up");
  });

  // 2026-05-26 — 토스 빌링 카드사 심사 진행 중 → checkout 카테고리 노출.
  it("default 상태 → checkout (토스 빌링) 항목 노출", async () => {
    const actions = await getPendingExternalActions();
    const tossAction = actions.find((a) => a.category === "checkout");
    expect(tossAction).toBeDefined();
    expect(tossAction?.label).toContain("토스");
    expect(tossAction?.url).toBe("/api/admin/mark-toss-billing-approved");
  });

  it("toss_billing_approved audit ≥ 1 → checkout 항목 hide", async () => {
    mockState.tossBillingCount = 1;
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "checkout")).toBeUndefined();
    // 다른 항목 영향 0
    expect(actions.find((a) => a.category === "security")).toBeDefined();
  });

  it("TOSS_SECRET_KEY 가 있으면 사장님 연결 완료 신호로 보고 checkout 항목 hide", async () => {
    process.env.TOSS_SECRET_KEY = "test";
    const actions = await getPendingExternalActions();
    expect(actions.find((a) => a.category === "checkout")).toBeUndefined();
  });

  // 2026-05-26 — CATEGORY_META 단일 source 검증.
  // 모든 카테고리가 emoji + 한국어 label 정의됨 (UI 누락 방지).
  it("CATEGORY_META 가 7 카테고리 모두 emoji + label 정의", async () => {
    const expectedCategories = [
      "security",
      "oauth",
      "automation",
      "checkout",
      "infrastructure",
      "adsense",
      "codex",
    ] as const;
    for (const cat of expectedCategories) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].emoji.length).toBeGreaterThan(0);
      expect(CATEGORY_META[cat].label.length).toBeGreaterThan(0);
    }
    // 실제 getPendingExternalActions 결과의 카테고리도 모두 매핑 가능
    const actions = await getPendingExternalActions();
    for (const a of actions) {
      expect(CATEGORY_META[a.category]).toBeDefined();
    }
  });

  // 2026-05-26 — category priority 정렬 (ops next action firstExternal[0] 우선순위).
  it("category priority — automation > security > oauth > codex > infrastructure", async () => {
    // default 상태: security · infrastructure · oauth · automation 4 카테고리 노출
    const actions = await getPendingExternalActions();
    const categories = actions.map((a) => a.category);
    // automation 이 security 보다 앞
    const automationIdx = categories.indexOf("automation");
    const securityIdx = categories.indexOf("security");
    const oauthIdx = categories.indexOf("oauth");
    const infraIdx = categories.indexOf("infrastructure");
    expect(automationIdx).toBeLessThan(securityIdx);
    expect(securityIdx).toBeLessThan(oauthIdx);
    expect(oauthIdx).toBeLessThan(infraIdx);
  });
});
