import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { compareAuditArtifacts } from "../../tools/naver-seo-html-audit-compare.mjs";

describe("naver-seo-html-audit-compare", () => {
  it("reports issue and warning deltas separately", () => {
    const before = {
      checkedAt: "2026-08-29T00:00:00.000Z",
      okCount: 2,
      urlCount: 2,
      issueCounts: {},
      warningCounts: { robots_noindex: 1 },
      rows: [
        { url: "https://www.keepioo.com/", issues: [], warnings: [] },
        { url: "https://www.keepioo.com/news", issues: [], warnings: ["robots_noindex"] },
      ],
    };
    const after = {
      checkedAt: "2026-08-30T00:00:00.000Z",
      okCount: 2,
      urlCount: 2,
      issueCounts: { short_description: 1 },
      warningCounts: { robots_noindex: 2 },
      rows: [
        { url: "https://www.keepioo.com/", issues: ["short_description"], warnings: ["robots_noindex"] },
        { url: "https://www.keepioo.com/news", issues: [], warnings: ["robots_noindex"] },
      ],
    };

    const result = compareAuditArtifacts(before, after);

    expect(result.issueDeltas).toEqual([{ key: "short_description", before: 0, after: 1, delta: 1 }]);
    expect(result.warningDeltas).toEqual([{ key: "robots_noindex", before: 1, after: 2, delta: 1 }]);
    expect(result.hasHardRegression).toBe(true);
    expect(result.hasWarningIncrease).toBe(true);
    expect(result.changedIssueRows).toHaveLength(1);
    expect(result.changedWarningRows).toHaveLength(1);
    expect(result.addedIssueRows).toEqual([
      { url: "https://www.keepioo.com/", signals: ["short_description"] },
    ]);
    expect(result.addedWarningRows).toEqual([
      { url: "https://www.keepioo.com/", signals: ["robots_noindex"] },
    ]);
  });

  it("tracks URL coverage changes without treating them as hard regressions", () => {
    const result = compareAuditArtifacts(
      {
        issueCounts: {},
        warningCounts: {},
        rows: [
          { url: "https://www.keepioo.com/", issues: [], warnings: [] },
          { url: "https://www.keepioo.com/old", issues: [], warnings: [] },
        ],
      },
      {
        issueCounts: {},
        warningCounts: {},
        rows: [
          { url: "https://www.keepioo.com/", issues: [], warnings: [] },
          { url: "https://www.keepioo.com/new", issues: [], warnings: [] },
        ],
      },
    );

    expect(result.urlDelta.added).toEqual(["https://www.keepioo.com/new"]);
    expect(result.urlDelta.removed).toEqual(["https://www.keepioo.com/old"]);
    expect(result.hasHardRegression).toBe(false);
  });

  it("treats a new issue row as a regression even when total issue counts do not increase", () => {
    const result = compareAuditArtifacts(
      {
        issueCounts: { short_description: 1 },
        warningCounts: {},
        rows: [
          { url: "https://www.keepioo.com/old", issues: ["short_description"], warnings: [] },
          { url: "https://www.keepioo.com/new", issues: [], warnings: [] },
        ],
      },
      {
        issueCounts: { short_description: 1 },
        warningCounts: {},
        rows: [
          { url: "https://www.keepioo.com/old", issues: [], warnings: [] },
          { url: "https://www.keepioo.com/new", issues: ["short_description"], warnings: [] },
        ],
      },
    );

    expect(result.issueDeltas).toEqual([]);
    expect(result.addedIssueRows).toEqual([
      { url: "https://www.keepioo.com/new", signals: ["short_description"] },
    ]);
    expect(result.resolvedIssueRows).toEqual([
      { url: "https://www.keepioo.com/old", signals: ["short_description"] },
    ]);
    expect(result.hasHardRegression).toBe(true);
  });

  it("fails on hard regressions when the regression gate is enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "naver-seo-compare-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ issueCounts: {}, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }] }));
    writeFileSync(after, JSON.stringify({ issueCounts: { short_description: 1 }, rows: [{ url: "https://www.keepioo.com/", issues: ["short_description"], warnings: [] }] }));

    expect(() =>
      execFileSync("node", ["tools/naver-seo-html-audit-compare.mjs", "--before", before, "--after", after, "--fail-on-regression"], {
        cwd: process.cwd(),
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("keeps warning-only increases non-fatal unless explicitly requested", () => {
    const dir = mkdtempSync(join(tmpdir(), "naver-seo-compare-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ warningCounts: {}, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }] }));
    writeFileSync(after, JSON.stringify({ warningCounts: { missing_canonical: 1 }, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: ["missing_canonical"] }] }));

    const output = execFileSync("node", ["tools/naver-seo-html-audit-compare.mjs", "--before", before, "--after", after, "--fail-on-regression"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });

    expect(output).toContain("Warning deltas:");
  });

  it("can fail only on warning increase when explicitly requested", () => {
    const dir = mkdtempSync(join(tmpdir(), "naver-seo-compare-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ warningCounts: {}, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }] }));
    writeFileSync(after, JSON.stringify({ warningCounts: { missing_canonical: 1 }, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: ["missing_canonical"] }] }));

    expect(() =>
      execFileSync("node", ["tools/naver-seo-html-audit-compare.mjs", "--before", before, "--after", after, "--fail-on-warning-increase"], {
        cwd: process.cwd(),
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("wires the scheduled workflow to fail hard regressions while leaving warning drift optional", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/naver-seo-html-audit.yml"), "utf8");

    expect(workflow).toContain("--fail-on-regression 2>&1 | tee /tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("FAIL_ON_WARNING_INCREASE");
    expect(workflow).toContain("--fail-on-warning-increase 2>&1 | tee -a /tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("/tmp/naver-seo-html-audit.log");
    expect(workflow).toContain("/tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("artifact regression 확인 필요");
    expect(workflow).toContain("--- compare ---");
    expect(workflow.indexOf("--fail-on-regression")).toBeLessThan(workflow.indexOf("if [ \"$FAIL_ON_WARNING_INCREASE\" = \"true\" ]"));
  });
});
