import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/naver-seo-weekly-report.yml"), "utf8");

describe("naver-seo weekly report workflow", () => {
  it("runs weekly on Node 24 and uploads report artifacts", () => {
    expect(workflow).toContain("name: Naver SEO weekly report");
    expect(workflow).toContain('cron: "10 0 * * 1"');
    expect(workflow).toContain("actions/setup-node@v6");
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("name: naver-seo-weekly-report");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("/tmp/naver-seo-weekly-report.json");
    expect(workflow).toContain("/tmp/naver-seo-trend-dashboard.md");
    expect(workflow).toContain("/tmp/naver-seo-weekly-summary.txt");
  });

  it("uses the read-only snapshot report CLI and preserves missing-secret bootstrap", () => {
    expect(workflow).toContain("npm run diagnose:naver-seo:snapshots");
    expect(workflow).toContain("--weekly-output /tmp/naver-seo-weekly-summary.txt");
    expect(workflow).toContain("--json-output /tmp/naver-seo-weekly-report.json");
    expect(workflow).toContain("--markdown-output /tmp/naver-seo-trend-dashboard.md");
    expect(workflow).toContain("missing_supabase_env");
    expect(workflow).toContain("Skipped: Supabase snapshot secrets are not configured.");
    expect(workflow).toContain("# Naver SEO trend dashboard");
    expect(workflow).toContain("CRON_SECRET missing; weekly report will be generated without Telegram notify.");
    expect(workflow).toContain("args+=(--notify)");
  });
});
