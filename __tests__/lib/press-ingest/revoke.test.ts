import { describe, it, expect } from "vitest";
import { buildRevokePayload, buildRestorePayload } from "@/lib/press-ingest/candidates";

describe("buildRevokePayload — 회수 시점 데이터 생성 (pure)", () => {
  it("welfare 회수 payload 는 is_hidden=true + revoked_at + revoked_by", () => {
    const before = Date.now();
    const payload = buildRevokePayload({ actorId: "u1" });
    expect(payload.is_hidden).toBe(true);
    expect(payload.revoked_by).toBe("u1");
    expect(new Date(payload.revoked_at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("system 회수 (actorId=null) 도 가능 — revoked_by=null", () => {
    const payload = buildRevokePayload({ actorId: null });
    expect(payload.revoked_by).toBeNull();
  });
});

describe("buildRestorePayload — 복원 시점 데이터 생성 (pure)", () => {
  it("복원 payload 는 is_hidden=false + revoked_at=null + revoked_by=null", () => {
    const payload = buildRestorePayload();
    expect(payload.is_hidden).toBe(false);
    expect(payload.revoked_at).toBeNull();
    expect(payload.revoked_by).toBeNull();
  });
});
