import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAdminAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agent/auth", () => ({
  checkAgentAuth: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/admin-actions", () => ({
  logAdminAction: mocks.logAdminAction,
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
    mocks.logAdminAction.mockClear();
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

  it("does not mark W1 calls as dispatched until a dispatcher exists", async () => {
    process.env.AGENT_W1_ENABLED = "true";

    const response = await POST(
      post({ area: "agent_call", action: "codex_diagnose" }),
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.dispatched).toBe(false);
    expect(json.w1_dispatcher_missing).toBe(true);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          dispatched: false,
          w1_enabled: true,
          dispatcher_ready: false,
          w1_dispatcher_missing: true,
        }),
      }),
    );
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
