import { describe, expect, it } from "vitest";
import { shouldShowPreviewUpgradeCta } from "@/app/mypage/notifications/rule-form";

describe("mypage notifications preview upgrade CTA", () => {
  it("shows the Pro upsell only for Basic users after a non-empty preview", () => {
    expect(shouldShowPreviewUpgradeCta("basic", 3)).toBe(true);
  });

  it("does not show the upsell when the preview has no matched policies", () => {
    expect(shouldShowPreviewUpgradeCta("basic", 0)).toBe(false);
  });

  it("does not show the upsell to already-Pro users", () => {
    expect(shouldShowPreviewUpgradeCta("pro", 3)).toBe(false);
  });

  it("does not show the upsell to free users because the page is gated before the preview form", () => {
    expect(shouldShowPreviewUpgradeCta("free", 3)).toBe(false);
  });
});
