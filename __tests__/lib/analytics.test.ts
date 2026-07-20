import { describe, expect, it, vi, afterEach } from "vitest";
import {
  captureTrafficAttribution,
  getPageCategory,
  shouldTrackAnalyticsPath,
  TRAFFIC_ATTRIBUTION_STORAGE_KEY,
  trackEvent,
} from "@/lib/analytics";

const originalLocation = window.location;

describe("analytics path guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
    });
    window.localStorage.clear();
  });

  it("excludes admin paths from GA4 event tracking", () => {
    expect(shouldTrackAnalyticsPath("/admin")).toBe(false);
    expect(shouldTrackAnalyticsPath("/admin/health")).toBe(false);
    expect(shouldTrackAnalyticsPath("/admin/health?x=1")).toBe(false);
    expect(shouldTrackAnalyticsPath("/login", "?next=/admin/health")).toBe(false);
    expect(shouldTrackAnalyticsPath("/blog")).toBe(true);
  });

  it("does not call gtag on admin pages", () => {
    const gtag = vi.fn();
    Object.defineProperty(window, "gtag", {
      value: gtag,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, pathname: "/admin/health" },
      configurable: true,
    });

    trackEvent("test_event");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("does not call gtag on login redirects from admin pages", () => {
    const gtag = vi.fn();
    Object.defineProperty(window, "gtag", {
      value: gtag,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, pathname: "/login", search: "?next=/admin/health" },
      configurable: true,
    });

    trackEvent("login_failed");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("calls gtag on public pages", () => {
    const gtag = vi.fn();
    Object.defineProperty(window, "gtag", {
      value: gtag,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, pathname: "/blog" },
      configurable: true,
    });

    trackEvent("test_event", { source: "unit" });
    expect(gtag).toHaveBeenCalledWith("event", "test_event", { source: "unit" });
  });

  it("stores UTM attribution and enriches later events", () => {
    const gtag = vi.fn();
    Object.defineProperty(window, "gtag", {
      value: gtag,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        pathname: "/pricing",
        search: "?utm_source=naver&utm_medium=cpc&utm_campaign=summer&utm_content=hero_a&gclid=abc123",
      },
      configurable: true,
    });

    const context = captureTrafficAttribution();
    expect(context).toMatchObject({
      utm_source: "naver",
      utm_medium: "cpc",
      utm_campaign: "summer",
      utm_content: "hero_a",
      click_id_type: "gclid",
      click_id_present: true,
    });
    expect(window.localStorage.getItem(TRAFFIC_ATTRIBUTION_STORAGE_KEY)).toContain("summer");

    trackEvent("checkout_started", { tier: "basic" });
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "checkout_started",
      expect.objectContaining({
        tier: "basic",
        utm_source: "naver",
        utm_medium: "cpc",
        utm_campaign: "summer",
        click_id_type: "gclid",
        click_id_present: true,
      }),
    );
  });

  it("classifies page categories for funnel reports", () => {
    expect(getPageCategory("/")).toBe("home");
    expect(getPageCategory("/pricing")).toBe("pricing");
    expect(getPageCategory("/checkout")).toBe("checkout");
    expect(getPageCategory("/blog/example")).toBe("content");
    expect(getPageCategory("/recommend")).toBe("activation");
  });
});
