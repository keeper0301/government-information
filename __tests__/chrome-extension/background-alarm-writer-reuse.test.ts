import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const backgroundScript = readFileSync(join(process.cwd(), "chrome-extension/background.js"), "utf8");

describe("Naver extension scheduled alarm writer policy", () => {
  it("requires an existing logged-in writer tab for scheduled live alarms", () => {
    expect(backgroundScript).toContain("async function handleAlarm(alarm)");
    expect(backgroundScript).toContain("const result = await runPublishBatch(false, {");
    expect(backgroundScript).toContain("allowLoginWait: false");
    expect(backgroundScript).toContain("reuseExistingWriter: true");
    expect(backgroundScript).toContain("requireExistingWriter: true");
  });

  it("keeps manual dry-run able to explicitly choose writer reuse without forcing live alarm policy", () => {
    expect(backgroundScript).toContain("reuseExistingWriter: msg.reuseExistingWriter === true");
    expect(backgroundScript).toContain("requireExistingWriter: msg.requireExistingWriter === true");
  });
});
