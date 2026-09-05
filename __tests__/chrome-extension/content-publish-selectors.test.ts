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

  it("does not mistake the top-right first-step publish button for the final confirm", () => {
    expect(contentScript).toContain('if (dataClickArea === "tpb.publish") return false;');
    expect(contentScript).not.toContain(
      'dataClickArea.includes("publish") && /발행|게시|확인|완료/.test(text)',
    );
  });

  it("accepts newer modal confirm buttons that only expose 발행 text inside a modal-like root", () => {
    expect(contentScript).toContain("const confirmText = /발행|게시|확인|완료/.test(text);");
    expect(contentScript).toContain("confirmText && modalLike");
    expect(contentScript).toContain('[class*=\"layer\"], [class*=\"Layer\"], [class*=\"modal\"], [class*=\"Modal\"], [role=\"dialog\"]');
  });

  it("opens the first publish layer with one DOM click before falling back", () => {
    expect(contentScript).toContain("async function openPublishConfirmLayer(mainPublish, mfDoc, debug)");
    expect(contentScript).toContain('debug.main_publish = "dom_click_once"');
    expect(contentScript).toContain("await openPublishConfirmLayer(mainPublish, mfDoc, debug)");
  });

  it("records the 2026 SmartEditor paste survival matrix and keeps HTML clipboard first", () => {
    expect(contentScript).toContain("NAVER_SMARTEDITOR_PASTE_SURVIVAL_MATRIX");
    expect(contentScript).toContain('survives: ["h2", "h3", "strong", "font-size", "text-align", "color", "blockquote", "hr", "img", "figure+figcaption"]');
    expect(contentScript).toContain('discarded: ["table", "ul-li-semantic", "pre-code", "em", "background-color", "style-sheet"]');
    expect(contentScript).toContain('new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob })');
  });

  it("blocks raw table paste unless a deployed webp image replacement is present", () => {
    expect(contentScript).toContain("function validateNaverSmartEditorPastePayload(html, debug)");
    expect(contentScript).toContain("metrics.tableCount > 0 && metrics.webpImageCount === 0");
    expect(contentScript).toContain("table을 webp 이미지로 배포한 뒤 <img>로 붙여넣어야 함");
    expect(contentScript).toContain("emptyFigureCaptionCount > 0");
    expect(contentScript).toContain("naverPasteOgCardRisk");
    expect(contentScript).toContain("URL-only paragraph는 OG 카드로 바뀔 수 있음");
  });

  it("verifies SmartEditor paste completeness against the original body ratio", () => {
    expect(contentScript).toContain("const NAVER_BODY_TEXT_MIN_RATIO = 0.5");
    expect(contentScript).toContain("const NAVER_BODY_IMAGE_MIN_RATIO = 0.7");
    expect(contentScript).toContain("function verifyBodyCompleteness(actualText, doc, html)");
    expect(contentScript).toContain("debug.bodyCompleteness = verifyBodyCompleteness(allBodyText, mfDoc, payload.bodyHtml)");
    expect(contentScript).toContain("dry-run fail: 본문 paste 불완전");
    expect(contentScript).not.toContain("expected≥200");
  });
});
