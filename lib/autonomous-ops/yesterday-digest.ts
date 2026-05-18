// ============================================================
// 어제 처리 누적 요약 — /admin/autonomous YesterdayDigestCard 데이터
// ============================================================
// 사장님 아침 hub 접속 시 한눈에 어제 무엇이 처리됐는지 인지.
// admin_actions 24h 누적 top 5 + 핵심 metric.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type YesterdayDigest = {
  /** 어제 KST 00:00 ~ 23:59 admin_actions 총 count */
  totalActions: number;
  /** action type 별 카운트 top 5 (DESC) */
  topActions: { action: string; count: number }[];
  /** 어제 published_at blog_posts count */
  blogPublished: number;
  /** 어제 발행된 instagram_posts count */
  instagramPublished: number;
  /** 어제 cron run audit (publish-blog, press-ingest 등 cron 가동 카운트) */
  cronRuns: number;
};

function kstYesterdayBounds(): { start: string; end: string } {
  const now = new Date();
  // KST = UTC+9, today midnight KST = (now - now.getUTCHours()*3600_000) ...
  // 단순 방법: 어제 24h ~ 오늘 0h 기준 — 메모리 절감 위해 24h window 채택
  const end = now.toISOString();
  const start = new Date(now.getTime() - 24 * 3600_000).toISOString();
  return { start, end };
}

export async function getYesterdayDigest(): Promise<YesterdayDigest> {
  try {
    const admin = createAdminClient();
    const { start, end } = kstYesterdayBounds();

    const [actionsRes, blogRes, instagramRes] = await Promise.all([
      admin
        .from("admin_actions")
        .select("action")
        .gte("created_at", start)
        .lt("created_at", end),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .gte("published_at", start)
        .lt("published_at", end)
        .not("published_at", "is", null),
      admin
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .gte("instagram_published_at", start)
        .lt("instagram_published_at", end)
        .not("instagram_published_at", "is", null),
    ]);

    const actions = (actionsRes.data ?? []) as { action: string }[];
    const counts = new Map<string, number>();
    for (const row of actions) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    const topActions = Array.from(counts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const cronRuns = actions.filter((r) => r.action.endsWith("_run")).length;

    return {
      totalActions: actions.length,
      topActions,
      blogPublished: blogRes.count ?? 0,
      instagramPublished: instagramRes.count ?? 0,
      cronRuns,
    };
  } catch {
    return {
      totalActions: 0,
      topActions: [],
      blogPublished: 0,
      instagramPublished: 0,
      cronRuns: 0,
    };
  }
}
