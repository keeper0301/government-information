import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("health-alert dry-run wiring", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "app/api/cron/health-alert/route.ts"),
    "utf8",
  );
  const workflowSource = readFileSync(
    join(process.cwd(), ".github/workflows/manual-site-cron.yml"),
    "utf8",
  );

  it("supports dry-run without notification or audit side effects", () => {
    expect(routeSource).toContain("mode: \"dry_run\"");
    expect(routeSource).toContain("audited: false");
    expect(routeSource).toContain("it does not write admin_actions, send email, SMS, or Telegram");
    expect(routeSource).toContain("isDryRunRequest");
  });

  it("exposes a safe manual workflow endpoint for health triage", () => {
    expect(workflowSource).toContain("- health-alert-dry");
    expect(workflowSource).toContain('path="/api/cron/health-alert?dry=1&log_safe=1"');
    expect(workflowSource).toContain("- health-alert");
  });

  it("exposes scoped local-press recovery endpoints for currently stale cities", () => {
    expect(workflowSource).toContain("- scrape-local-press-pocheon-yeoju");
    expect(workflowSource).toContain(
      'path="/api/cron/scrape-local-press?cities=pocheon,yeoju"',
    );
    expect(workflowSource).toContain("- scrape-local-press-dongducheon");
    expect(workflowSource).toContain(
      'path="/api/cron/scrape-local-press?cities=dongducheon"',
    );
    expect(workflowSource).toContain('method="GET"');
  });
});
