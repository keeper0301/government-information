import { describe, expect, it } from "vitest";

import {
  buildNaverSeoTrendDashboard,
  renderNaverSeoTrendMarkdown,
  renderNaverSeoWeeklySummary,
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
    expect(dashboard.actionItems).toEqual([
      "/welfare/new CTR 3%입니다. 검색 intent에 맞게 title/description을 다시 써볼 후보입니다.",
      "새 키워드 청년 월세 관련 랜딩/콘텐츠를 확인하세요.",
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

  it("renders a Telegram-ready weekly summary", () => {
    const weekly = renderNaverSeoWeeklySummary(buildNaverSeoTrendDashboard(snapshots, "2026-08-30"));

    expect(weekly).toContain("네이버 SEO 주간 요약 (2026-08-30)");
    expect(weekly).toContain("색인 120 (+20) · 노출 1,400 (+400) · 클릭 70 (+30)");
    expect(weekly).toContain("이번 주 볼 것");
    expect(weekly).toContain("저CTR 우선 후보");
    expect(weekly).toContain("새 키워드: 청년 월세");
  });

  it("handles empty snapshot input", () => {
    expect(buildNaverSeoTrendDashboard([], "2026-08-30")).toMatchObject({
      generatedAt: "2026-08-30",
      snapshotCount: 0,
      status: "empty",
    });
  });
});
