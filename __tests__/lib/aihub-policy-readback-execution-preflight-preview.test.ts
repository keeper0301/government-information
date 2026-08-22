import { describe, expect, it } from "vitest";

import { buildPolicyReadbackExecutionPreflightPreview } from "@/lib/aihub-policy-readback-execution-preflight-preview";

describe("AIHub policy readback execution preflight preview", () => {
  it("builds blocked operator preflight items from W13 schedule cards", async () => {
    const preview = await buildPolicyReadbackExecutionPreflightPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
      baseUrl: "https://example.test",
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(preview.status).toBe("read_only_readback_execution_preflight_preview");
    expect(preview.sourceStatus).toBe("readback_schedule_preview_pending_live_publish");
    expect(preview.requestedSlot).toBe("all");
    expect(preview.count).toBe(6);
    expect(preview.safety.cronCreate).toBe(false);
    expect(preview.safety.externalFetch).toBe(false);
    expect(preview.safety.preflightPreviewMeans).toBe("readback_run_gate_only_not_live_execution");

    const first = preview.items[0];
    expect(first.status).toBe("readback_execution_preflight_preview_blocked");
    expect(first.slot).toBe("immediate");
    expect(first.executionMode).toBe("manual_readback_preview_only");
    expect(first.canRunNow).toBe(false);
    expect(first.canCreateCron).toBe(false);
    expect(first.canFetchExternal).toBe(false);
    expect(first.canSubmitSearch).toBe(false);
    expect(first.requiredApprovals).toContain("관철의 live readback 실행 승인");
    expect(first.requiredInputs).toContain("실제 발행 완료 receipt");
    expect(first.preflightChecks).toContain("published URL이 2xx/readable인지 확인하기 전까지 실행 금지");
    expect(first.blockingReasons).toContain("W14는 실행 전 preflight preview라 canRunNow=false 유지");
  });

  it("can preview only one requested schedule slot", async () => {
    const preview = await buildPolicyReadbackExecutionPreflightPreview({
      fetcher: async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      itemLimit: 2,
      sourceLimit: 1,
      slot: "after_24h",
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(preview.requestedSlot).toBe("after_24h");
    expect(preview.count).toBe(2);
    expect(preview.items.every((item) => item.slot === "after_24h")).toBe(true);
    expect(preview.items[0]?.requiredApprovals).toContain("GSC 성과 readback 범위와 기준 시각 승인");
  });

  it("keeps preflight preview empty when the scheduler source queue is empty", async () => {
    const preview = await buildPolicyReadbackExecutionPreflightPreview({
      fetcher: async () => new Response("blocked", { status: 503 }),
      itemLimit: 2,
      sourceLimit: 1,
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(preview.count).toBe(0);
    expect(preview.items).toEqual([]);
    expect(preview.sourceSchedulerPreview.count).toBe(0);
    expect(preview.safety.dbWrite).toBe(false);
  });
});
