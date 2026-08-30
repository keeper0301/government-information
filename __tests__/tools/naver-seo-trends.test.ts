import { describe, expect, it } from "vitest";

import {
  buildNaverSeoTrendDashboard,
  renderNaverSeoTrendMarkdown,
} from "../../tools/naver-seo/trends.mjs";

const snapshots = [
  {
    collected_at: "2026-08-16T00:00:00.000Z",
    indexed_count: 100,
    index_excluded: 4,
    total_impressions: 1000,
    total_clicks: 40,
    avg_ctr: 4,
    seo_issues: { duplicate_title: 3, missing_description: 1 },
    top_keywords: [
      { label: "소상공인 정책", impression: 300, click: 10, ctr: 3.3 },
    ],
    top_pages: [
      { label: "https://www.keepioo.com/welfare/old", impression: 90, click: 2, ctr: 2.2 },
    ],
  },
  {
    collected_at: "2026-08-23T00:00:00.000Z",
    indexed_count: 120,
    index_excluded: 5,
    total_impressions: 1400,
    total_clicks: 70,
    avg_ctr: 5,
    seo_issues: { duplicate_title: 1 },
    top_keywords: [
      { label: "소상공인 정책", impression: 500, click: 20, ctr: 4 },
      { label: "청년 월세", impression: 120, click: 9, ctr: 7.5 },
    ],
    top_pages: [
      { label: "https://www.keepioo.com/welfare/new", impression: 100, click: 3, ctr: 3 },
      { label: "https://www.keepioo.com/news", impression: 40, click: 0, ctr: 0 },
    ],
  },
];

describe("naver-seo trends", () => {
  it("builds a dashboard with deltas, low CTR pages, and fresh keywords", () => {
    const dashboard = buildNaverSeoTrendDashboard(snapshots, "2026-08-30");

    expect(dashboard).toMatchObject({
      generatedAt: "2026-08-30",
      snapshotCount: 2,
      status: "ok",
      currentAt: "2026-08-23T00:00:00.000Z",
      previousAt: "2026-08-16T00:00:00.000Z",
      metrics: {
        indexedCount: 120,
        indexedDelta: 20,
        totalImpressions: 1400,
        impressionsDelta: 400,
        totalClicks: 70,
        clicksDelta: 30,
        avgCtr: 5,
        avgCtrDelta: 1,
        seoIssueTotal: 1,
        seoIssueDelta: -3,
      },
    });
    expect(dashboard.lowCtrPages).toEqual([
      {
        url: "https://www.keepioo.com/welfare/new",
        path: "/welfare/new",
        impression: 100,
        click: 3,
        ctr: 3,
      },
    ]);
    expect(dashboard.freshKeywords).toEqual([
      { label: "청년 월세", impression: 120, click: 9, ctr: 7.5 },
    ]);
  });

  it("renders a compact markdown dashboard", () => {
    const markdown = renderNaverSeoTrendMarkdown(buildNaverSeoTrendDashboard(snapshots, "2026-08-30"));

    expect(markdown).toContain("# Naver SEO trend dashboard");
    expect(markdown).toContain("indexed: 120 (+20)");
    expect(markdown).toContain("impressions: 1,400 (+400)");
    expect(markdown).toContain("/welfare/new");
    expect(markdown).toContain("청년 월세");
  });

  it("handles empty snapshot input", () => {
    expect(buildNaverSeoTrendDashboard([], "2026-08-30")).toMatchObject({
      generatedAt: "2026-08-30",
      snapshotCount: 0,
      status: "empty",
    });
  });
});
