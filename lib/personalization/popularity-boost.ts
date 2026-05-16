// ============================================================
// 추천 시스템 popularity boost (Phase A 6차)
// ============================================================
// user_events (DDL 093) 의 30일 click 데이터로 인기 정책 set 구성.
// ScoredItem 의 score 에 boost (view 0.5 + apply 2 max ~5점) 가산 →
// 인기 정책이 추천 상단 노출.
//
// 메모리 cache 5분 (사용자별 추천 호출당 DB fetch 부담 차단).
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchSignal } from "./types";

type PopularityEntry = { score: number; views: number; applies: number };

type PopularityCache = {
  expiresAt: number;
  byProgramId: Map<string, PopularityEntry>;
};

let _cache: PopularityCache | null = null;
let _inflight: Promise<PopularityCache["byProgramId"]> | null = null;
const TTL_MS = 5 * 60 * 1000; // 5분

const VIEW_WEIGHT = 0.5;
const APPLY_WEIGHT = 2;
const MAX_BOOST = 5; // cap — 매우 인기 정책도 +5 까지만 (다른 시그널 압도 X)

// 직전 30일 program 별 view/apply 합계 → boost score map.
// 메모리 cache 5분 + inflight Promise 단일화 (A 8차 — 동시 다발 cache miss 시 DB 중복 query 차단).
async function loadPopularitySet(): Promise<PopularityCache["byProgramId"]> {
  const now = Date.now();
  if (_cache && _cache.expiresAt > now) return _cache.byProgramId;

  // 이미 fetch 가 진행 중이면 그 Promise 를 재사용 — 동시 다발 cache miss 안전책.
  // serverless 같은 instance 에 여러 request 동시 도착 시 N+1 query 차단.
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const admin = createAdminClient();
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { data } = await admin
        .from("user_events")
        .select("program_id, event_type")
        .gte("created_at", since)
        .not("program_id", "is", null)
        .in("event_type", ["program_view", "apply_click"])
        .limit(10000);

      const byProgramId = new Map<string, PopularityEntry>();
      for (const row of (data ?? []) as Array<{
        program_id: string | null;
        event_type: string;
      }>) {
        if (!row.program_id) continue;
        const entry = byProgramId.get(row.program_id) ?? {
          score: 0,
          views: 0,
          applies: 0,
        };
        if (row.event_type === "program_view") entry.views += 1;
        if (row.event_type === "apply_click") entry.applies += 1;
        entry.score = Math.min(
          MAX_BOOST,
          entry.views * VIEW_WEIGHT + entry.applies * APPLY_WEIGHT,
        );
        byProgramId.set(row.program_id, entry);
      }

      _cache = { expiresAt: Date.now() + TTL_MS, byProgramId };
      return byProgramId;
    } finally {
      // 성공·실패 무관 inflight 해제 — 다음 호출이 stale Promise 재사용 차단
      _inflight = null;
    }
  })();

  return _inflight;
}

// score 결과 list 에 popularity boost 적용. order 유지.
// caller — score.ts 의 scoreAndFilter 결과를 받아 boost 후 재정렬.
// A 7차: signals 배열에도 popularity 시그널 push (UI 배지 노출용).
export async function applyPopularityBoost<T extends { id: string }>(
  items: Array<{ item: T; score: number; signals: MatchSignal[] }>,
): Promise<Array<{ item: T; score: number; signals: MatchSignal[] }>> {
  const popMap = await loadPopularitySet();
  if (popMap.size === 0) return items;
  // boost 적용 + signals 에 popularity 추가 + 점수 재정렬
  return items
    .map((s) => {
      const pop = popMap.get(s.item.id);
      if (!pop) return s;
      const popularitySignal: MatchSignal = {
        kind: "popularity",
        score: pop.score,
        detail: `view ${pop.views}·apply ${pop.applies}`,
      };
      return {
        ...s,
        score: s.score + pop.score,
        signals: [...s.signals, popularitySignal],
      };
    })
    .sort((a, b) => b.score - a.score);
}

// 단일 score 에만 boost — caller 가 N+1 query 없이 빠르게 사용 가능 (cache 전제).
export async function getProgramPopularityScore(
  programId: string,
): Promise<number> {
  const popMap = await loadPopularitySet();
  return popMap.get(programId)?.score ?? 0;
}

// test 전용 — cache + inflight reset
export function _resetPopularityCache(): void {
  _cache = null;
  _inflight = null;
}
