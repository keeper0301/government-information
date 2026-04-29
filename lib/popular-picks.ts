// ============================================================
// 인기 정책 TOP N — 가중 점수 알고리즘 (2026-04-29 강화)
// ============================================================
// 홈 우측 sticky sidebar (1800px+) 와 AlertStrip 다음 일반 섹션 양쪽에서 사용.
// react cache 로 같은 요청 안 1회만 fetch.
//
// 같은 정책이 양쪽 노출 — sidebar 는 큰 모니터 사용자 fixed sticky,
// 일반 섹션은 모든 viewport 사용자 첫 화면 스크롤 직후. UX 분리 의도.
//
// ── 선정 기준 (기존 단순 view_count → 4 시그널 가중) ──
//   1. base = view_count (조회수 그대로)
//   2. 마감 임박 boost — D-7 이내 ×1.5, D-14 이내 ×1.2 (사용자 행동 유도)
//   3. 신규 가산 — created_at 7일 이내 ×1.3, 14일 이내 ×1.15
//      (정체된 인기 회피, 새 정책에 노출 기회)
//   4. 카테고리 cap — benefit_tags 첫 토큰 기준 max 2건/카테고리
//      (대출·복지 또는 청년·노년 등 한 분야 쏠림 차단, 다양성 ↑)
//   5. dedupe — duplicate_of_id IS NULL (Phase 3 dedupe 결과 일관 적용)
// ============================================================

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  WELFARE_EXCLUDED_FILTER,
  LOAN_EXCLUDED_FILTER,
} from "@/lib/listing-sources";

export type PopularPick = {
  id: string;
  title: string;
  view_count: number;
  apply_end: string | null;
  kind: "welfare" | "loan";
};

// 점수 계산용 raw row (DB select 결과 + kind)
export interface ScorableRow {
  id: string;
  title: string;
  view_count: number | null;
  apply_end: string | null;
  created_at: string;
  benefit_tags: string[] | null;
  kind: "welfare" | "loan";
}

const DEFAULT_LIMIT = 5;
const MAX_PER_CATEGORY = 2;
const FETCH_LIMIT = 30; // welfare/loan 각자 30건 fetch 후 score+cap 으로 5건 컷

// ============================================================
// 마감 임박 boost — D-7 이내 ×1.5, D-14 이내 ×1.2, 나머지 ×1.0
// 상시 모집 (apply_end null) 은 boost 없음 (마감 압박 없으니 클릭 유도 의미 약)
// ============================================================
export function deadlineBoost(applyEnd: string | null, today: Date): number {
  if (!applyEnd) return 1.0;
  const end = new Date(applyEnd).getTime();
  const now = today.getTime();
  const diffDays = (end - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 1.0; // 마감 지난 row 는 fetch 단계에서 이미 제외, 안전망
  if (diffDays <= 7) return 1.5;
  if (diffDays <= 14) return 1.2;
  return 1.0;
}

// ============================================================
// 신규 가산 — created_at 7일 이내 ×1.3, 14일 이내 ×1.15, 나머지 ×1.0
// ============================================================
export function freshnessBoost(createdAt: string, today: Date): number {
  const created = new Date(createdAt).getTime();
  const now = today.getTime();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1.0; // 미래 created_at — 데이터 이상, 안전망
  if (ageDays <= 7) return 1.3;
  if (ageDays <= 14) return 1.15;
  return 1.0;
}

// ============================================================
// 가중 점수 = view_count × deadlineBoost × freshnessBoost
// view_count 0 인 row 도 boost 곱하면 0 → fetch 단계 view_count > 0 가드 의존.
// ============================================================
export function calcScore(row: ScorableRow, today: Date): number {
  const base = row.view_count ?? 0;
  return base * deadlineBoost(row.apply_end, today) * freshnessBoost(row.created_at, today);
}

// ============================================================
// 카테고리 cap — benefit_tags 첫 토큰 기준 max N건/카테고리.
// benefit_tags 비어있으면 row.kind ('welfare'/'loan') 를 카테고리로.
// ============================================================
export function applyCategoryCap<T extends ScorableRow>(
  rows: T[],
  limit: number,
  maxPerCategory: number = MAX_PER_CATEGORY,
): T[] {
  const counts = new Map<string, number>();
  const result: T[] = [];
  for (const row of rows) {
    if (result.length >= limit) break;
    const cat = row.benefit_tags && row.benefit_tags.length > 0
      ? row.benefit_tags[0]
      : row.kind;
    const current = counts.get(cat) ?? 0;
    if (current >= maxPerCategory) continue;
    counts.set(cat, current + 1);
    result.push(row);
  }
  // cap 으로 limit 미달 시 부족분 채움 (cap 무시)
  if (result.length < limit) {
    const seen = new Set(result.map((r) => r.id));
    for (const row of rows) {
      if (result.length >= limit) break;
      if (seen.has(row.id)) continue;
      result.push(row);
    }
  }
  return result;
}

// ============================================================
// 메인 — fetch + 가중 점수 + 카테고리 cap → TOP N
// ============================================================
export const getPopularPicks = cache(
  async (limit: number = DEFAULT_LIMIT): Promise<PopularPick[]> => {
    const supabase = await createClient();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // welfare/loan 각자 view_count 상위 N건 fetch — 충분한 후보로 score 후 cap
    const [welfareRes, loanRes] = await Promise.all([
      supabase
        .from("welfare_programs")
        .select("id, title, view_count, apply_end, created_at, benefit_tags")
        .not("source_code", "in", WELFARE_EXCLUDED_FILTER)
        .or(`apply_end.gte.${todayStr},apply_end.is.null`)
        .is("duplicate_of_id", null)
        .gt("view_count", 0)
        .order("view_count", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("loan_programs")
        .select("id, title, view_count, apply_end, created_at, benefit_tags")
        .not("source_code", "in", LOAN_EXCLUDED_FILTER)
        .or(`apply_end.gte.${todayStr},apply_end.is.null`)
        .is("duplicate_of_id", null)
        .gt("view_count", 0)
        .order("view_count", { ascending: false })
        .limit(FETCH_LIMIT),
    ]);

    const merged: ScorableRow[] = [
      ...(welfareRes.data ?? []).map((w) => ({ ...w, kind: "welfare" as const })),
      ...(loanRes.data ?? []).map((l) => ({ ...l, kind: "loan" as const })),
    ];

    // 가중 점수 desc 정렬 → 카테고리 cap → limit 컷
    const scored = merged
      .map((row) => ({ row, score: calcScore(row, today) }))
      .sort((a, b) => b.score - a.score)
      .map(({ row }) => row);
    const final = applyCategoryCap(scored, limit);

    return final.map((r) => ({
      id: r.id,
      title: r.title,
      view_count: r.view_count ?? 0,
      apply_end: r.apply_end,
      kind: r.kind,
    }));
  },
);
