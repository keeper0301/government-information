import { describe, expect, it } from "vitest";

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
});
