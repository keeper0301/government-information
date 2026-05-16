// ============================================================
// 사용자 클릭 데이터 집계 — Phase A 분석 helper
// ============================================================
// user_events (migration 093) 의 30일 click 데이터 집계.
// 추천 정확도 학습 + 인기 정책 분석 + 사장님 인사이트.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";

export type TopProgram = {
  programTable: "welfare_programs" | "loan_programs" | "news_posts";
  programId: string;
  viewCount: number;
  applyClickCount: number;
};

export type EventTypeStats = {
  event_type: string;
  count: number;
};

// 직전 N일 인기 정책 top K (view + apply click 합산 가중치)
export async function getTopProgramsByEvents(
  days = 30,
  limit = 10,
): Promise<TopProgram[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const { data } = await admin
    .from("user_events")
    .select("program_table, program_id, event_type")
    .gte("created_at", since)
    .not("program_id", "is", null)
    .limit(10000); // 메모리 안전 cap

  if (!data) return [];

  // 메모리 집계 — table+id 별 count
  const map = new Map<
    string,
    { table: TopProgram["programTable"]; id: string; views: number; applies: number }
  >();
  for (const row of data as Array<{
    program_table: string | null;
    program_id: string | null;
    event_type: string;
  }>) {
    if (!row.program_table || !row.program_id) continue;
    const key = `${row.program_table}:${row.program_id}`;
    const stat = map.get(key) ?? {
      table: row.program_table as TopProgram["programTable"],
      id: row.program_id,
      views: 0,
      applies: 0,
    };
    if (row.event_type === "program_view") stat.views += 1;
    if (row.event_type === "apply_click") stat.applies += 1;
    map.set(key, stat);
  }

  // 가중치: view 1점 + apply 5점 (apply 가 더 강한 의도 신호)
  const scored = Array.from(map.values())
    .map((s) => ({
      programTable: s.table,
      programId: s.id,
      viewCount: s.views,
      applyClickCount: s.applies,
      score: s.views + s.applies * 5,
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => ({
    programTable: s.programTable,
    programId: s.programId,
    viewCount: s.viewCount,
    applyClickCount: s.applyClickCount,
  }));
}

// event_type 별 24h 합계 (autonomous hub metric)
export async function getEventTypeStats24h(): Promise<EventTypeStats[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("user_events")
    .select("event_type")
    .gte("created_at", since)
    .limit(10000);

  if (!data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ event_type: string }>) {
    counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([event_type, count]) => ({ event_type, count }))
    .sort((a, b) => b.count - a.count);
}
