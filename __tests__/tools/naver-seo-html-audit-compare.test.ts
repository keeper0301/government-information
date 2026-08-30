import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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

  it("tracks audit scope changes without treating them as hard regressions", () => {
    const result = compareAuditArtifacts(
      {
        site: "https://www.keepioo.com",
        sitemap: "https://www.keepioo.com/sitemap.xml",
        limit: 32,
        extraUrls: ["https://www.keepioo.com/news"],
        issueCounts: {},
        warningCounts: {},
        rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }],
      },
      {
        site: "https://www.keepioo.com",
        sitemap: "https://www.keepioo.com/sitemap.xml",
        limit: 64,
        extraUrls: ["https://www.keepioo.com/news", "https://www.keepioo.com/loan/region/daegu"],
        issueCounts: {},
        warningCounts: {},
        rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }],
      },
    );

    expect(result.scopeDeltas).toEqual([
      { key: "limit", before: "32", after: "64" },
      {
        key: "extraUrls",
        before: ["https://www.keepioo.com/news"],
        after: ["https://www.keepioo.com/loan/region/daegu", "https://www.keepioo.com/news"],
      },
    ]);
    expect(result.hasHardRegression).toBe(false);
  });

  it("fails on hard regressions when the regression gate is enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "naver-seo-compare-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ issueCounts: {}, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }] }));
    writeFileSync(after, JSON.stringify({ issueCounts: { short_description: 1 }, rows: [{ url: "https://www.keepioo.com/", issues: ["short_description"], warnings: [] }] }));

    const result = spawnSync("node", ["tools/naver-seo-html-audit-compare.mjs", "--before", before, "--after", after, "--fail-on-regression"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("FAIL: hard SEO issue regression detected");
    expect(result.stdout).toContain("Added issue rows: 1");
    expect(result.stdout).toContain("https://www.keepioo.com/: short_description");
  });

  it("keeps warning-only increases non-fatal unless explicitly requested", () => {
    const dir = mkdtempSync(join(tmpdir(), "naver-seo-compare-"));
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    writeFileSync(before, JSON.stringify({ warningCounts: {}, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: [] }] }));
    writeFileSync(after, JSON.stringify({ warningCounts: { missing_canonical: 1 }, rows: [{ url: "https://www.keepioo.com/", issues: [], warnings: ["missing_canonical"] }] }));

    const jsonOutput = join(dir, "compare.json");
    const output = execFileSync("node", ["tools/naver-seo-html-audit-compare.mjs", "--before", before, "--after", after, "--json-output", jsonOutput, "--fail-on-regression"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    const saved = JSON.parse(readFileSync(jsonOutput, "utf8"));

    expect(output).toContain("Warning deltas:");
    expect(output).toContain("Added warning rows: 1");
    expect(output).toContain("https://www.keepioo.com/: missing_canonical");
    expect(output).toContain("OK: no hard SEO issue regression");
    expect(output).toContain("WARN: warning signal increased");
    expect(saved.hasWarningIncrease).toBe(true);
    expect(saved.addedWarningRows).toEqual([{ url: "https://www.keepioo.com/", signals: ["missing_canonical"] }]);
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

    expect(workflow).toContain("- site: ${result.site || 'unknown'}");
    expect(workflow).toContain("- sitemap: ${result.sitemap || 'unknown'}");
    expect(workflow).toContain("- limit: ${result.limit ?? 'unknown'}");
    expect(workflow).toContain("- extra URLs: ${extraUrls.length}");
    expect(workflow).toContain("--json-output /tmp/naver-seo-html-audit-compare.json --fail-on-regression 2>&1 | tee /tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("hard_status=${PIPESTATUS[0]}");
    expect(workflow).toContain("warning_status=${PIPESTATUS[0]}");
    expect(workflow).toContain("FAIL_ON_WARNING_INCREASE");
    expect(workflow).toContain("--fail-on-warning-increase 2>&1 | tee -a /tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("/tmp/naver-seo-html-audit.log");
    expect(workflow).toContain("/tmp/naver-seo-html-audit-compare.log");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("function redactSecrets(text)");
    expect(workflow).toContain("Bearer)\\s+[A-Za-z0-9._~+/=-]{12,}");
    expect(workflow).toContain("'Author' + 'ization:'");
    expect(workflow).toContain("[REDACTED]");
    expect(workflow).toContain("log = redactSecrets(fs.readFileSync('/tmp/naver-seo-html-audit.log', 'utf8'))");
    expect(workflow).toContain("compareLog = redactSecrets(fs.readFileSync('/tmp/naver-seo-html-audit-compare.log', 'utf8'))");
    expect(workflow).toContain("artifact regression 확인 필요");
    expect(workflow).toContain("FAIL: hard SEO issue regression detected");
    expect(workflow).toContain("WARN: warning signal increased");
    expect(workflow).toContain("- scope deltas: ${(result.scopeDeltas || []).length}");
    expect(workflow).toContain("WARN: audit scope changed");
    expect(workflow).toContain("Scope deltas:");
    expect(workflow).toContain("- resolved issue rows: ${result.resolvedIssueRows.length}");
    expect(workflow).toContain("- resolved warning rows: ${result.resolvedWarningRows.length}");
    expect(workflow).toContain("pushScopeSample(result.scopeDeltas)");
    expect(workflow).toContain("### audit scope changes");
    expect(workflow).toContain("rows.slice(0, 4)");
    expect(workflow).toContain("formatScopeValue(row.before)");
    expect(workflow).toContain("pushSample('added issue sample', result.addedIssueRows)");
    expect(workflow).toContain("pushSample('resolved issue sample', result.resolvedIssueRows)");
    expect(workflow).toContain("pushSample('added warning sample', result.addedWarningRows)");
    expect(workflow).toContain("pushSample('resolved warning sample', result.resolvedWarningRows)");
    expect(workflow).toContain("rows.slice(0, 3)");
    expect(workflow).toContain("const comparePriority = /^(FAIL:|WARN:)/");
    expect(workflow).toContain("...compareLines.filter((line) => comparePriority.test(line.trim()))");
    expect(workflow).toContain(".slice(0, 14)");
    expect(workflow).toContain("--- compare ---");
    expect(workflow.indexOf("--fail-on-regression")).toBeLessThan(workflow.indexOf("if [ \"$FAIL_ON_WARNING_INCREASE\" = \"true\" ]"));
  });
});
