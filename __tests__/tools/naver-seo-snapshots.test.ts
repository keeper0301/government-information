import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  buildNaverSeoSnapshotArtifacts,
  fetchNaverSeoSnapshots,
  NAVER_SEO_SNAPSHOT_COLUMNS,
} from "../../tools/naver-seo/snapshots.mjs";

const rows = [
  {
    collected_at: "2026-08-23T00:00:00.000Z",
    indexed_count: 120,
    total_impressions: 1400,
    total_clicks: 70,
    avg_ctr: 5,
    seo_issues: { duplicate_title: 1 },
    top_keywords: [{ label: "청년 월세", impression: 120, click: 9, ctr: 7.5 }],
    top_pages: [{ label: "https://www.keepioo.com/welfare/new", impression: 100, click: 3, ctr: 3 }],
  },
  {
    collected_at: "2026-08-16T00:00:00.000Z",
    indexed_count: 100,
    total_impressions: 1000,
    total_clicks: 40,
    avg_ctr: 4,
    seo_issues: { duplicate_title: 3 },
    top_keywords: [],
    top_pages: [],
  },
];

describe("naver-seo snapshots", () => {
  it("queries recent snapshots read-only and returns chronological rows", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const client = {
      from(table: string) {
        calls.push(["from", table]);
        return {
          select(columns: string) {
            calls.push(["select", columns]);
            return {
              order(column: string, options: unknown) {
                calls.push(["order", column, options]);
                return {
                  async limit(limit: number) {
                    calls.push(["limit", limit]);
                    return { data: rows, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    await expect(fetchNaverSeoSnapshots(client, { limit: 2 })).resolves.toEqual([rows[1], rows[0]]);
    expect(calls).toEqual([
      ["from", "naver_seo_snapshots"],
      ["select", NAVER_SEO_SNAPSHOT_COLUMNS],
      ["order", "collected_at", { ascending: false }],
      ["limit", 2],
    ]);
  });

  it("builds dashboard and weekly artifacts from snapshot rows", () => {
    const artifacts = buildNaverSeoSnapshotArtifacts([rows[1], rows[0]], "2026-08-30");

    expect(artifacts.dashboard).toMatchObject({
      status: "ok",
      snapshotCount: 2,
      metrics: { indexedDelta: 20, impressionsDelta: 400, clicksDelta: 30 },
    });
    expect(artifacts.markdown).toContain("# Naver SEO trend dashboard");
    expect(artifacts.weekly).toContain("네이버 SEO 주간 요약 (2026-08-30)");
  });

  it("fails safely when Supabase env is missing", () => {
    const result = spawnSync("node", ["tools/naver-seo/snapshots.mjs", "--weekly"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Supabase env 누락");
  });
});
