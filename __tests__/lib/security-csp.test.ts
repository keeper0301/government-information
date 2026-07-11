import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildReportOnlyContentSecurityPolicy,
} from "@/lib/security/csp";

describe("CSP helpers", () => {
  it("keeps enforced CSP compatibility-first", () => {
    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("script-src");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("report-uri");
  });

  it("adds a stricter report-only policy for unsafe-eval observation", () => {
    const csp = buildReportOnlyContentSecurityPolicy();

    expect(csp).toContain("script-src");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("report-uri /api/csp-report");
  });
});
