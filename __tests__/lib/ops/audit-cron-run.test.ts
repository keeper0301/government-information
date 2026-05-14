// __tests__/lib/ops/audit-cron-run.test.ts
// 2026-05-14 — subagent W3 fix.
// auditCronRun helper 의 핵심 design 은 "audit logging 실패해도 cron 자체 응답 유지"
// (try/catch swallow + console.warn). 9 cron 의존이라 회귀 시 영향 큼 — spec 보호.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { auditCronRun } from "@/lib/ops/audit-cron-run";

// logAdminAction 을 mock — 실제 Supabase 호출 안 함
vi.mock("@/lib/admin-actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-actions")>(
    "@/lib/admin-actions",
  );
  return {
    ...actual,
    logAdminAction: vi.fn(),
  };
});

const { logAdminAction } = await import("@/lib/admin-actions");

describe("auditCronRun", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("정상 logAdminAction 호출 (action + details + actorId=null)", async () => {
    vi.mocked(logAdminAction).mockResolvedValueOnce(undefined);
    await auditCronRun("collect_run", { total: 100 });
    expect(logAdminAction).toHaveBeenCalledWith({
      actorId: null,
      action: "collect_run",
      details: { total: 100 },
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("logAdminAction throw 시 swallow + console.warn (cron 응답 유지 보장)", async () => {
    vi.mocked(logAdminAction).mockRejectedValueOnce(new Error("DB down"));
    // 핵심 design: throw 안 하고 정상 return
    await expect(
      auditCronRun("press_ingest_run", { error: "X" }),
    ).resolves.toBeUndefined();
    // console.warn 으로 진단 정보는 남김
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("press_ingest_run"),
      expect.stringContaining("DB down"),
    );
  });

  it("빈 details ({}) 도 호출 가능 (skipped 분기 등)", async () => {
    vi.mocked(logAdminAction).mockResolvedValueOnce(undefined);
    await auditCronRun("alert_dispatch_run", {});
    expect(logAdminAction).toHaveBeenCalledWith({
      actorId: null,
      action: "alert_dispatch_run",
      details: {},
    });
  });
});
