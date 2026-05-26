// ============================================================
// 카테고리별 인기 추세 분석 (2026-05-26 D5)
// ============================================================
// news_posts 의 category × created_at × view_count 으로 추세.
// /admin/category-trends page 가 사용.
//
// 카테고리 (memory: project_categorization_unified_2026_04_25):
//   - welfare (복지) · loan (대출) · news (정책 뉴스) · blog (블로그)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type CategoryTrendStat = {
  category: string; // "welfare" | "loan" | "news" | "blog" | "기타"
  count: number; // 7일 신규
  totalViews: number; // 7일 신규 의 view_count 합
  avgViews: number; // count > 0 시 totalViews / count
};

export type CategoryTrendStats = {
  days: number;
  stats: CategoryTrendStat[]; // count 순 정렬
  totalCount: number;
  totalViews: number;
};

export async function getCategoryTrends(
  days = 7,
): Promise<CategoryTrendStats> {
  const admin = createAdminClient();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  // category·view_count 집계 — count + view_count sum 한번에
  // 2026-05-26 review fix: PostgREST default 1000 row 가 90일 (~수만 row) 잘릴 위험 → .limit(50000) 명시
  const { data: rows, error } = await admin
    .from("news_posts")
    .select("category, view_count")
    .gte("created_at", since)
    .not("category", "is", null)
    .limit(50000);

  if (error || !rows) {
    return { days, stats: [], totalCount: 0, totalViews: 0 };
  }

  const byCategory = new Map<string, { count: number; views: number }>();
  for (const row of rows) {
    const cat = row.category ?? "기타";
    const views = Number(row.view_count ?? 0);
    const prev = byCategory.get(cat) ?? { count: 0, views: 0 };
    byCategory.set(cat, { count: prev.count + 1, views: prev.views + views });
  }

  // 2026-05-26 — count 동률 시 totalViews 순, 다음 category localeCompare (검수 추적 안정)
  const stats: CategoryTrendStat[] = Array.from(byCategory.entries())
    .map(([category, v]) => ({
      category,
      count: v.count,
      totalViews: v.views,
      avgViews: v.count > 0 ? Math.round(v.views / v.count) : 0,
    }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (a.totalViews !== b.totalViews) return b.totalViews - a.totalViews;
      return a.category.localeCompare(b.category);
    });

  return {
    days,
    stats,
    totalCount: stats.reduce((s, c) => s + c.count, 0),
    totalViews: stats.reduce((s, c) => s + c.totalViews, 0),
  };
}
