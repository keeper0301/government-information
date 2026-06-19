import { describe, expect, it, vi, afterEach } from "vitest";
import { shouldTrackAnalyticsPath, trackEvent } from "@/lib/analytics";

const originalLocation = window.location;

describe("analytics path guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
    });
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
});
