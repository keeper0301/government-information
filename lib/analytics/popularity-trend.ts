// ============================================================
// popularity 30일 추세 분석 (A 12차)
// ============================================================
// popularity_snapshots 테이블 → autonomous hub 차트 시계열 데이터.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type DailyPopularityPoint = {
  snapshot_date: string; // YYYY-MM-DD
  score: number;
};

export type ProgramTrend = {
  program_id: string;
  program_table: string;
  title: string | null; // 최신 fetch — DB join 안 함, top-N 만 별도 lookup
  series: DailyPopularityPoint[]; // 날짜 오름차순
  latest_score: number;
};

// 지난 30일 누적 score 가 가장 큰 top N program 의 시계열.
// caller — autonomous hub 의 PopularityTrendCard.
export async function getPopularityTrend(
  topN: number = 3,
): Promise<ProgramTrend[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);

  // 1차: 누적 score top N program_id 찾기
  const { data: aggData } = await admin
    .from("popularity_snapshots")
    .select("program_id, program_table, score")
    .gte("snapshot_date", since)
    .order("score", { ascending: false })
    .limit(500); // pool — 같은 program 여러 행 중 sum 으로 집계 후 잘라야

  if (!aggData || aggData.length === 0) return [];

  // 누적 score 집계 (program_id 별 sum)
  const agg = new Map<
    string,
    { program_table: string; total: number }
  >();
  for (const row of aggData as Array<{
    program_id: string;
    program_table: string;
    score: number;
  }>) {
    const cur = agg.get(row.program_id) ?? {
      program_table: row.program_table,
      total: 0,
    };
    cur.total += Number(row.score);
    agg.set(row.program_id, cur);
  }
  const topIds = [...agg.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, topN)
    .map(([id]) => id);

  if (topIds.length === 0) return [];

  // 2차: top N 의 시계열 fetch
  const { data: seriesData } = await admin
    .from("popularity_snapshots")
    .select("program_id, snapshot_date, score")
    .in("program_id", topIds)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });

  const seriesByProgram = new Map<string, DailyPopularityPoint[]>();
  for (const row of (seriesData ?? []) as Array<{
    program_id: string;
    snapshot_date: string;
    score: number;
  }>) {
    const list = seriesByProgram.get(row.program_id) ?? [];
    list.push({ snapshot_date: row.snapshot_date, score: Number(row.score) });
    seriesByProgram.set(row.program_id, list);
  }

  // 3차: 카테고리별 title lookup
  const welfareIds = topIds.filter(
    (id) => agg.get(id)?.program_table === "welfare_programs",
  );
  const loanIds = topIds.filter(
    (id) => agg.get(id)?.program_table === "loan_programs",
  );
  const newsIds = topIds.filter(
    (id) => agg.get(id)?.program_table === "news_posts",
  );

  const [welfareRows, loanRows, newsRows] = await Promise.all([
    welfareIds.length > 0
      ? admin
          .from("welfare_programs")
          .select("id, title")
          .in("id", welfareIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    loanIds.length > 0
      ? admin
          .from("loan_programs")
          .select("id, title")
          .in("id", loanIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    newsIds.length > 0
      ? admin
          .from("news_posts")
          .select("id, title")
          .in("id", newsIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);

  const titleMap = new Map<string, string>();
  for (const r of (welfareRows.data ?? []) as Array<{
    id: string;
    title: string;
  }>) {
    titleMap.set(r.id, r.title);
  }
  for (const r of (loanRows.data ?? []) as Array<{
    id: string;
    title: string;
  }>) {
    titleMap.set(r.id, r.title);
  }
  for (const r of (newsRows.data ?? []) as Array<{
    id: string;
    title: string;
  }>) {
    titleMap.set(r.id, r.title);
  }

  return topIds.map((id) => {
    const series = seriesByProgram.get(id) ?? [];
    const latest = series.length > 0 ? series[series.length - 1].score : 0;
    return {
      program_id: id,
      program_table: agg.get(id)?.program_table ?? "welfare_programs",
      title: titleMap.get(id) ?? null,
      series,
      latest_score: latest,
    };
  });
}
