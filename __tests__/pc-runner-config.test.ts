import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const runnerScript = readFileSync(join(process.cwd(), "pc-runner/local-press-runner.mjs"), "utf8");
const setupScript = readFileSync(join(process.cwd(), "pc-runner/setup-desktop.ps1"), "utf8");
const uploadRoute = readFileSync(join(process.cwd(), "app/api/admin/local-press/upload/route.ts"), "utf8");
const pendingExternalActions = readFileSync(
  join(process.cwd(), "lib/autonomous-ops/pending-external-actions.ts"),
  "utf8",
);

describe("PC runner setup and heartbeat config", () => {
  it("uses the current Windows user profile instead of a hard-coded account", () => {
    expect(setupScript).toContain('Join-Path $env:USERPROFILE "keepioo-pc-runner"');
    expect(setupScript).not.toContain("C:\\Users\\cgc09");
  });

  it("keeps the desktop runner aligned with the server-supported PC runner city keys", () => {
    expect(runnerScript).toContain('{ key: "namdong"');
    expect(runnerScript).not.toContain('{ key: "busan"');
    expect(runnerScript).not.toContain('{ key: "gwangsan"');
    expect(runnerScript).not.toContain('{ key: "jeju"');
    expect(runnerScript).not.toContain('{ key: "pyeongtaek"');
  });

  it("uploads a heartbeat even when the PC-side fetch returns no round2 candidates", () => {
    expect(runnerScript).toContain("round2 대상 0건");
    expect(runnerScript).toContain("runner_error");
    expect(uploadRoute).toContain("runner_error?: string");
    expect(uploadRoute).toContain("PC runner list fetch 실패");
  });

  it("does not keep stale external-action copy for migrated 광산구·제주·평택 PC runner sites", () => {
    expect(pendingExternalActions).toContain("현재 PC runner 지원 대상은 남동구");
    expect(pendingExternalActions).toContain("일반 cron/GHA proxy 로 이관됨");
    expect(pendingExternalActions).not.toContain("ASN 차단 3 site (광산구·제주·평택)");
  });
});
