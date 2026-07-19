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

  it("searches both SmartEditor frame and top document for the final confirm modal", () => {
    expect(contentScript).toContain("function publishConfirmSearchRoots(mfDoc)");
    expect(contentScript).toContain('add(mfDoc, "mainFrame")');
    expect(contentScript).toContain('add(document, "topDocument")');
    expect(contentScript).toContain("waitForPublishConfirmButton(mfDoc, 12000)");
  });

  it("records confirm candidate snapshots for post-failure diagnosis", () => {
    expect(contentScript).toContain("snapshotPublishConfirmCandidates(mfDoc)");
    expect(contentScript).toContain("confirm_publish_candidates");
    expect(contentScript).toContain("dry_run_confirm_candidates");
  });

  it("falls back to the recent Naver post list when post-submit URL capture misses the redirect", () => {
    expect(contentScript).toContain("capturePublishedUrl(mfDoc, debug, payload)");
    expect(contentScript).toContain("async function captureUrlFromRecentPostList(payload, debug)");
    expect(contentScript).toContain("PostList.naver?blogId=");
    expect(contentScript).toContain("url_capture_postlist_title_matched");
    expect(contentScript).toContain("nFirstLogNo");
    expect(contentScript).toContain("https://blog.naver.com/${blogId}/${logNo}");
  });
});
