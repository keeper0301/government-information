// ============================================================
// 블로그 발행 통계 helper (5/17)
// ============================================================
// 5/15 spending cap 사고 (2.5일 발행 멈춤) 재발 방지.
// 사장님 매일 hub 1번 확인 시 발행 정상 가동 시각 가속.
//
// 데이터 출처:
// - blog_posts published_at IS NOT NULL — 실제 발행된 글
// - 24h/7d 누적 + lastPublishedAt
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type BlogPublishStats = {
  published24h: number;
  published7d: number;
  lastPublishedAt: string | null;
  hoursSinceLastPublish: number; // 마지막 발행 이후 hours
  // 5/15 사고 baseline: 평소 1~2 글/일. 36h 무발행 = 의심, 60h+ = 사고.
  status: "healthy" | "watch" | "stalled";
};

export async function getBlogPublishStats(): Promise<BlogPublishStats> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [c24, c7d, lastRow] = await Promise.all([
    admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since24h)
      .not("published_at", "is", null),
    admin
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since7d)
      .not("published_at", "is", null),
    admin
      .from("blog_posts")
      .select("published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastPublishedAt = lastRow.data?.published_at ?? null;
  const hoursSinceLastPublish = lastPublishedAt
    ? Math.round(
        (Date.now() - new Date(lastPublishedAt).getTime()) / 3600_000,
      )
    : 9999;

  // status — 5/15 사고 패턴 (60h+ 무발행) 자동 감지.
  // 평소 baseline = GitHub Actions 매일 06:00 UTC 1 글/일 + 외부 publish 가능.
  const status: BlogPublishStats["status"] =
    hoursSinceLastPublish <= 36
      ? "healthy"
      : hoursSinceLastPublish <= 60
        ? "watch"
        : "stalled";

  return {
    published24h: c24.count ?? 0,
    published7d: c7d.count ?? 0,
    lastPublishedAt,
    hoursSinceLastPublish,
    status,
  };
}
