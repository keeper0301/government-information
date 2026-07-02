import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentScript = readFileSync(join(process.cwd(), "chrome-extension/content.js"), "utf8");

describe("Naver content publish selectors", () => {
  it("uses the stable final-publish data-click-area selector without requiring layer_publish", () => {
    expect(contentScript).toContain(
      "const NAVER_CONFIRM_PUBLISH_SELECTOR = 'button[data-click-area=\"tpb*i.publish\"]'",
    );
    expect(contentScript).not.toContain(
      "[class*=\"layer_publish\"] button[data-click-area=\"tpb*i.publish\"]",
    );
  });
});
