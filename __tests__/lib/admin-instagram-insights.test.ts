import { describe, expect, it } from "vitest";
import { buildAdminInstagramInsights } from "@/lib/admin-instagram-insights";

describe("buildAdminInstagramInsights", () => {
  it("builds latest media snapshots with hook and category rollups", () => {
    const nowMs = Date.parse("2026-07-20T00:00:00.000Z");
    const data = buildAdminInstagramInsights({
      nowMs,
      posts: [
        {
          slug: "post-a",
          title: "지원금 A",
          category: "육아·가족",
          instagram_media_id: "media-a",
          instagram_published_at: "2026-07-19T20:00:00.000Z",
        },
        {
          slug: "post-b",
          title: "컨설팅 B",
          category: "소상공인",
          instagram_media_id: "media-b",
          instagram_published_at: "2026-07-18T20:00:00.000Z",
        },
      ],
      actions: [
        {
          action: "instagram_publish_success",
          created_at: "2026-07-19T20:01:00.000Z",
          details: {
            media_id: "media-a",
            cardHookType: "money_deadline",
            cardHookLabel: "대상·금액·기간 한 장 정리",
          },
        },
        {
          action: "instagram_insights_collect",
          created_at: "2026-07-19T21:00:00.000Z",
          details: {
            mediaId: "media-a",
            metrics: { reach: 10, saved: 0, shares: 0, profile_activity: 0, total_interactions: 0 },
          },
        },
        {
          action: "instagram_insights_collect",
          created_at: "2026-07-19T22:00:00.000Z",
          details: {
            mediaId: "media-a",
            metrics: { reach: 40, saved: 1, shares: 0, profile_activity: 0, total_interactions: 1 },
          },
        },
        {
          action: "instagram_insights_collect",
          created_at: "2026-07-18T21:00:00.000Z",
          details: {
            mediaId: "media-b",
            metrics: { reach: 15, saved: 0, shares: 0, profile_activity: 0, total_interactions: 0 },
          },
        },
      ],
    });

    expect(data.summary24h).toMatchObject({ posts: 1, reach: 40, saved: 1, saveRate: 2.5 });
    expect(data.summary7d).toMatchObject({ posts: 2, reach: 55, saved: 1 });
    expect(data.posts[0]).toMatchObject({ mediaId: "media-a", signal: "good", cardHookType: "money_deadline" });
    expect(data.posts[1]).toMatchObject({ mediaId: "media-b", signal: "bad", cardHookType: "unknown" });
    expect(data.categories.find((row) => row.category === "육아·가족")).toMatchObject({ reach: 40, saved: 1 });
    expect(data.hooks.find((row) => row.hookType === "money_deadline")).toMatchObject({ posts: 1, reach: 40, saved: 1 });
  });
});
