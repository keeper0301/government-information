import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAdminAction: vi.fn(async () => undefined),
  runDiagnose: vi.fn(async (question: string) => ({
    question,
    data: { ok: true },
    collected_at: "2026-05-18T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/agent/auth", () => ({
  checkAgentAuth: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
}));

vi.mock("@/lib/agent/diagnose", () => ({
  listDiagnoseQuestions: () => ["health_overview", "blog_publish_status"],
  runDiagnose: mocks.runDiagnose,
}));

import { POST } from "@/app/api/agent/execute/route";

function post(body: unknown): Request {
  return new Request("https://example.test/api/agent/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/agent/execute", () => {
  beforeEach(() => {
    delete process.env.AGENT_W1_ENABLED;
    delete process.env.AGENT_W2_ENABLED;
    mocks.logAdminAction.mockClear();
    mocks.runDiagnose.mockClear();
  });

  it("keeps auto_execute actions in W0 audit-only mode by default", async () => {
    const response = await POST(
      post({ area: "agent_call", action: "codex_diagnose" }),
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.dispatched).toBe(false);
    expect(json.w0_pending).toBe(true);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_execute_run",
        details: expect.objectContaining({
          action: "codex_diagnose",
          decision_mode: "auto_execute",
          dispatched: false,
          w1_enabled: false,
          w0_pending: true,
        }),
      }),
    );
  });

  it("keeps W1 calls queued until W2 dispatcher mode is enabled", async () => {
    process.env.AGENT_W1_ENABLED = "true";

    const response = await POST(
      post({ area: "agent_call", action: "codex_diagnose" }),
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.dispatched).toBe(false);
    expect(json.w0_pending).toBe(true);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          dispatched: false,
          w1_enabled: true,
          w2_enabled: false,
          dispatcher_ready: true,
          w0_pending: true,
        }),
      }),
    );
  });

  it("dispatches registered auto_execute actions in W2 mode", async () => {
    process.env.AGENT_W1_ENABLED = "true";
    process.env.AGENT_W2_ENABLED = "true";

    const response = await POST(
      post({ area: "agent_call", action: "codex_diagnose", question: "blog_publish_status" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.dispatched).toBe(true);
    expect(json.dispatch_result.status).toBe("completed");
    expect(mocks.runDiagnose).toHaveBeenCalledWith("blog_publish_status");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          dispatched: true,
          w1_enabled: true,
          w2_enabled: true,
          dispatcher_ready: true,
          dispatch_status: "completed",
        }),
      }),
    );
  });

  it("keeps unregistered auto_execute actions queued even in W2 mode", async () => {
    process.env.AGENT_W2_ENABLED = "true";

    const response = await POST(
      post({ area: "site_ops", action: "external_signal_learning" }),
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.dispatched).toBe(false);
    expect(json.w2_dispatcher_missing).toBe(true);
  });

  it("blocks destructive agent calls before any dispatch", async () => {
    const response = await POST(
      post({ area: "agent_call", action: "codex_diagnose", destructive: true }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.blocked).toBe(true);
    expect(json.dispatched).toBe(false);
  });
});
