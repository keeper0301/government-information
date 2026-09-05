import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const backgroundScript = readFileSync(join(process.cwd(), "chrome-extension/background.js"), "utf8");

describe("Naver extension scheduled alarm writer policy", () => {
  it("keeps scheduled live alarms disabled unless the local live gate is explicitly enabled", () => {
    expect(backgroundScript).toContain('chrome.storage.local.get("naver_live_alarm_enabled")');
    expect(backgroundScript).toContain("liveGate?.naver_live_alarm_enabled !== true");
    expect(backgroundScript).toContain('stoppedReason: "live_alarm_disabled"');
    expect(backgroundScript).toContain("fresh approval required before scheduled live publish");
  });

  it("requires an existing logged-in writer tab when scheduled live alarms are explicitly enabled", () => {
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

  it("closes the writer tab only after verified live publish success", () => {
    expect(backgroundScript).toContain("async function closePublishedWriterTab(tabId, reason)");
    expect(backgroundScript).toContain('closePublishedWriterTab(tab.id, "verified_publish_success")');
    expect(backgroundScript).toContain('setManualPublishStatus("published_writer_tab_closed"');
  });

  it("exposes read-only runtime status for alarm/gate diagnostics", () => {
    expect(backgroundScript).toContain('if (msg?.type === "get-runtime-status")');
    expect(backgroundScript).toContain("async function getRuntimeStatus()");
    expect(backgroundScript).toContain("chrome.alarms.getAll()");
    expect(backgroundScript).toContain('likelyBlocker: !liveAlarmEnabled && lastGate?.liveAlarmEnabled === false');
    expect(backgroundScript).toContain('"live_alarm_disabled"');
    expect(backgroundScript).toContain('"alarms_not_registered"');
  });

  it("uses humanized CDP typing cadence instead of fastest fixed delays", () => {
    expect(backgroundScript).toContain("function humanDelay(baseMs, jitterRatio = 0.3)");
    expect(backgroundScript).toContain("await humanDelay(220, 0.45)");
    expect(backgroundScript).toContain("await humanDelay(250, 0.35)");
    expect(backgroundScript).toContain("function humanClickCount()");
    expect(backgroundScript).toContain("Math.random() < 0.08 ? 2 : 1");
  });
});
