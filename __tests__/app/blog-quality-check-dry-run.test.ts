import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  join(process.cwd(), "app/api/cron/blog-quality-check/route.ts"),
  "utf8",
);
const workflowSource = readFileSync(
  join(process.cwd(), ".github/workflows/manual-site-cron.yml"),
  "utf8",
);

describe("blog-quality-check manual dry run", () => {
  it("supports a dry/log-safe mode before any LLM evaluation or external release", () => {
    const dryRunIndex = routeSource.indexOf("if (dryRun)");
    const evaluateIndex = routeSource.indexOf("async function evaluateOne");

    expect(dryRunIndex).toBeGreaterThan(0);
    expect(evaluateIndex).toBeGreaterThan(dryRunIndex);
    expect(routeSource).toContain('mode: "dry_run"');
    expect(routeSource).toContain("it does not call LLMs, update review fields, enqueue Naver, or publish WordPress");
    expect(routeSource).toContain("candidateTitles: list.slice(0, 10).map((p) => p.title)");
  });

  it("exposes dry and live choices through the safe manual-site-cron whitelist", () => {
    expect(workflowSource).toContain("- blog-quality-check-dry");
    expect(workflowSource).toContain("- blog-quality-check");
    expect(workflowSource).toContain('path="/api/cron/blog-quality-check?dry=1&log_safe=1"');
    expect(workflowSource).toContain('path="/api/cron/blog-quality-check"');
  });
});
