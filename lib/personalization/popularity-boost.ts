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
// Spec 2 — 학습된 weights 조회 (DB 5분 cache + default fallback)
import { loadCurrentWeights } from "./popularity-weights-settings";

type PopularityEntry = {
  score: number;
  views: number;
  applies: number;
  programTable: string | null; // A 10차: top N fallback 시 카테고리별 분리 위해 보존
};

type PopularityCache = {
  expiresAt: number;
  byProgramId: Map<string, PopularityEntry>;
};

let _cache: PopularityCache | null = null;
let _inflight: Promise<PopularityCache["byProgramId"]> | null = null;
const TTL_MS = 5 * 60 * 1000; // 5분
const NEGATIVE_TTL_MS = 30 * 1000; // A 11차: DB error 시 30초 빈 cache — 폭주 차단 + 자가치유

// A 12차 (5/17) — cron (popularity-snapshot) 과 단일 source. 한쪽 튜닝 시 silent mismatch 차단.
// Spec 2 (5/27) — 이 값은 default fallback. 실제 사용은 loadCurrentWeights() 가 DB 학습값
// (popularity_weights_history) 을 5분 cache 로 조회. cron 미가동/DB 실패 시 이 값으로 회귀.
export const POPULARITY_WEIGHTS = {
  VIEW_WEIGHT: 0.5,
  APPLY_WEIGHT: 2,
  MAX_BOOST: 5, // cap — 매우 인기 정책도 +5 까지만 (다른 시그널 압도 X)
} as const;

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
      // Spec 2 — 학습된 weights (DB 5분 cache) — cron 미가동/실패 시 default fallback.
      const w = await loadCurrentWeights();
      const admin = createAdminClient();
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { data, error } = await admin
        .from("user_events")
        .select("program_id, event_type, program_table")
        .gte("created_at", since)
        .not("program_id", "is", null)
        .in("event_type", ["program_view", "apply_click"])
        .limit(10000);

      // A 10차: DB 에러 시 page 500 차단 — 빈 Map 반환 (boost no-op 으로 fallback)
      // A 11차: 빈 Map 도 negative cache (30초) 로 저장 — DB 5분 다운 시 매 호출
      // 재시도로 query 폭주 사고 차단. 30초 후 자동 자가치유.
      if (error) {
        console.error("[popularity-boost] DB error:", error.message);
        const emptyMap = new Map<string, PopularityEntry>();
        _cache = { expiresAt: Date.now() + NEGATIVE_TTL_MS, byProgramId: emptyMap };
        return emptyMap;
      }

      const byProgramId = new Map<string, PopularityEntry>();
      for (const row of (data ?? []) as Array<{
        program_id: string | null;
        event_type: string;
        program_table: string | null;
      }>) {
        if (!row.program_id) continue;
        const entry = byProgramId.get(row.program_id) ?? {
          score: 0,
          views: 0,
          applies: 0,
          programTable: row.program_table ?? null,
        };
        if (row.event_type === "program_view") entry.views += 1;
        if (row.event_type === "apply_click") entry.applies += 1;
        entry.score = Math.min(
          w.maxBoost,
          entry.views * w.viewWeight + entry.applies * w.applyWeight,
        );
        byProgramId.set(row.program_id, entry);
      }

      _cache = { expiresAt: Date.now() + TTL_MS, byProgramId };
      return byProgramId;
    } catch (err) {
      // A 10차: 네트워크·예외 발생 시 빈 Map — caller 의 await 가 throw 하지 않도록 보장
      // A 11차: 예외 시도 negative cache (30초) — 폭주 차단
      console.error("[popularity-boost] unexpected error:", err);
      const emptyMap = new Map<string, PopularityEntry>();
      _cache = { expiresAt: Date.now() + NEGATIVE_TTL_MS, byProgramId: emptyMap };
      return emptyMap;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

// ============================================================
// signals 부족 사용자 fallback (A 10차)
// ============================================================
// 비로그인·빈 프로필 사용자에게 "인기 top N" 자동 노출 시 사용.
// popularity score 내림차순 + programTable 별 분리.
// ============================================================
export async function getTopPopularPrograms(
  programTable: "welfare_programs" | "loan_programs" | "news_posts",
  limit: number = 3,
): Promise<Array<{ id: string; score: number; views: number; applies: number }>> {
  const popMap = await loadPopularitySet();
  if (popMap.size === 0) return [];
  const candidates: Array<{
    id: string;
    score: number;
    views: number;
    applies: number;
  }> = [];
  for (const [id, entry] of popMap.entries()) {
    if (entry.programTable !== programTable) continue;
    candidates.push({
      id,
      score: entry.score,
      views: entry.views,
      applies: entry.applies,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
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
