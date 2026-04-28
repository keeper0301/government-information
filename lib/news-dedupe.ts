// lib/news-dedupe.ts
// 뉴스 중복 제거 helper — DB INSERT 전 7일 window 매칭 검사 (Phase 5).
//
// display dedupe (lib/personalization/dedupe.ts) 와 분리:
//   - display dedupe: list 후처리, Jaccard 0.5, in-memory
//   - news dedupe: ingestion 전, Jaccard 0.6 (more strict), DB lookup 1회 +
//                  in-memory N×M 비교
//
// 사용 흐름 (collector batch 처리):
//   1) loadRecentDedupeHashes(supabase) — 7일치 hash 1회 fetch
//   2) 각 새 row 마다 computeDedupeHash(title) → batch seen + recent 비교
//   3) 통과한 row 만 dedupe_hash 함께 upsert

import type { SupabaseClient } from "@supabase/supabase-js";

export const NEWS_DEDUPE_THRESHOLD = 0.6;
export const NEWS_DEDUPE_WINDOW_DAYS = 7;
const RECENT_HASHES_LIMIT = 2000;

/**
 * 제목을 dedupe_hash 로 변환.
 *  - 한글·영문·숫자만 남김 (특수문자·공백 제거)
 *  - bigram (글자 쌍) set 추출
 *  - 정렬 + ',' join → string (DB 컬럼 저장 + 다음 비교용)
 */
export function computeDedupeHash(title: string): string {
  if (!title) return "";
  const cleaned = title.replace(/[^가-힣0-9a-zA-Z]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.add(cleaned.slice(i, i + 2));
  }
  return Array.from(bigrams).sort().join(",");
}

/**
 * 두 dedupe_hash 의 Jaccard similarity.
 * hash 가 ',' join 된 bigram set 이라 split 만 하면 됨.
 */
export function jaccardOfHashes(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(","));
  const setB = new Set(b.split(","));
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 7일 window 안의 기존 row 의 dedupe_hash 일괄 fetch.
 * collector 가 batch 시작 시 1회만 호출 → in-memory 비교에 사용.
 */
export async function loadRecentDedupeHashes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  windowDays = NEWS_DEDUPE_WINDOW_DAYS,
): Promise<string[]> {
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("news_posts")
    .select("dedupe_hash")
    .gte("published_at", sinceIso)
    .not("dedupe_hash", "is", null)
    .limit(RECENT_HASHES_LIMIT);
  return (data ?? [])
    .map((r: { dedupe_hash: string | null }) => r.dedupe_hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);
}

/**
 * 새 hash 가 기존 hash list 중 임계값 이상 매칭되는 게 있는가?
 * collector 가 각 새 row 마다 호출 (in-memory, DB 호출 0).
 */
export function hasJaccardMatch(
  newHash: string,
  existingHashes: string[],
  threshold = NEWS_DEDUPE_THRESHOLD,
): boolean {
  if (!newHash) return false;
  for (const h of existingHashes) {
    if (jaccardOfHashes(newHash, h) >= threshold) return true;
  }
  return false;
}
