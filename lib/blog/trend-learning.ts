// ============================================================
// 블로그 내부 트렌드 학습 힌트
// ============================================================
// 외부 트렌드 API 없이, keepioo 안에서 최근 조회가 높은 글의 카테고리·태그를
// 다음 글 생성 프롬프트에 되먹임한다. 지속 학습의 가장 안전한 1차 신호.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type BlogTrendRow = {
  title: string;
  category: string | null;
  tags: string[] | null;
  view_count: number | null;
};

const DEFAULT_LIMIT = 5;
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function topEntries(counts: Map<string, number>, limit: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([label, count]) => `${label}(${count})`);
}

export function extractBlogTrendHints(
  rows: BlogTrendRow[],
  limit: number = DEFAULT_LIMIT,
): string[] {
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const topTitles = rows
    .filter((row) => (row.view_count ?? 0) > 0)
    .slice(0, 3)
    .map((row) => row.title.trim())
    .filter(Boolean);

  for (const row of rows) {
    const weight = Math.max(1, Math.min(10, Math.ceil((row.view_count ?? 0) / 10)));
    if (row.category) {
      categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + weight);
    }
    for (const tag of row.tags ?? []) {
      const cleaned = tag.trim().replace(/^#/, "");
      if (!cleaned) continue;
      tagCounts.set(cleaned, (tagCounts.get(cleaned) ?? 0) + weight);
    }
  }

  const hints: string[] = [];
  const categories = topEntries(categoryCounts, 3);
  if (categories.length > 0) {
    hints.push(`최근 반응 카테고리: ${categories.join(", ")}`);
  }
  const tags = topEntries(tagCounts, 5);
  if (tags.length > 0) {
    hints.push(`최근 반응 태그: ${tags.join(", ")}`);
  }
  if (topTitles.length > 0) {
    hints.push(`최근 조회 상위 글: ${topTitles.join(" / ")}`);
  }
  return hints.slice(0, limit);
}

export async function getRecentBlogTrendHints({
  limit = DEFAULT_LIMIT,
  lookbackMs = DEFAULT_LOOKBACK_MS,
}: {
  limit?: number;
  lookbackMs?: number;
} = {}): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - lookbackMs).toISOString();
    const { data, error } = await admin
      .from("blog_posts")
      .select("title, category, tags, view_count")
      .not("published_at", "is", null)
      .gte("published_at", since)
      .gt("view_count", 0)
      .order("view_count", { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return extractBlogTrendHints(data as BlogTrendRow[], limit);
  } catch {
    return [];
  }
}
