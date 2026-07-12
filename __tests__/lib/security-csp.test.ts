import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildReportOnlyContentSecurityPolicy,
} from "@/lib/security/csp";

describe("CSP helpers", () => {
  it("removes unsafe-eval from enforced CSP after production observation", () => {
    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("script-src");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("https://*.adtrafficquality.google");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("report-uri");
  });

  it("keeps report-only collection aligned with enforced CSP", () => {
    const enforce = buildContentSecurityPolicy();
    const reportOnly = buildReportOnlyContentSecurityPolicy();

    expect(reportOnly).toContain("script-src");
    expect(reportOnly).toContain("'unsafe-inline'");
    expect(reportOnly).not.toContain("'unsafe-eval'");
    expect(reportOnly).toContain("report-uri /api/csp-report");
    expect(reportOnly.replace("; report-uri /api/csp-report", "")).toBe(enforce);
  });
});
