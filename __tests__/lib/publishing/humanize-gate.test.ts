import { describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { applyHumanizeGateToPayload } from "@/lib/publishing/humanize-gate";

function gateScript(code: number): string {
  const dir = mkdtempSync(join(tmpdir(), "humanize-gate-test-"));
  const path = join(dir, "gate.js");
  writeFileSync(
    path,
    `#!/usr/bin/env node\nconsole.log('/home/user/.hermes/workspace/reports/publishing-humanize-gate-keepioo-latest.md');\nprocess.exit(${code});\n`,
    "utf8",
  );
  chmodSync(path, 0o755);
  return path;
}

describe("applyHumanizeGateToPayload", () => {
  it("downgrades publish payload to draft on review warning", () => {
    vi.stubEnv("KEEPIOO_HUMANIZE_GATE_ENABLED", "1");
    vi.stubEnv("KEEPIOO_HUMANIZE_GATE_PATH", gateScript(1));

    const result = applyHumanizeGateToPayload({
      title: "정책 글",
      status: "publish" as const,
      content: "<p>본문입니다.</p>",
    }, { keyword: "정책" });

    expect(result.status).toBe("draft");
    expect(result.humanizeGate?.action).toBe("downgrade_to_draft");
    expect(result.humanizeGate?.reportPath).toContain("publishing-humanize-gate");
  });

  it("skips draft payloads", () => {
    vi.stubEnv("KEEPIOO_HUMANIZE_GATE_ENABLED", "1");

    const result = applyHumanizeGateToPayload({
      title: "정책 글",
      status: "draft" as const,
      content: "<p>본문입니다.</p>",
    });

    expect(result.status).toBe("draft");
    expect(result.humanizeGate?.enabled).toBe(false);
  });
});
