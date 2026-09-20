import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const background = readFileSync("chrome-extension/background.js", "utf8");
const content = readFileSync("chrome-extension/content.js", "utf8");

describe("Naver extension reliability guards", () => {
  it("reconciles only known callback-loss errors with exact public identity checks", () => {
    expect(background).toContain("edit_public_readback_reconciled");
    expect(background).toContain("executeScript result 없음");
    expect(background).toContain("exactCtaIdentity");
    expect(background).toContain("readbackCorePhrase");
  });

  it("fetches the cover in the extension background and fails closed until an editor image appears", () => {
    expect(background).toContain("fetch-cover-image");
    expect(background).toContain("https://www.keepioo.com/api/naver-thumbnail/");
    expect(content).toContain('cover_fetch_source = "extension_background"');
    expect(content).toContain("waitForEditorImageCount");
    expect(content).toContain("커버 없는 글로 진행하지 않음");
  });
});
