// ============================================================
// news_posts INSERT 공용 helper (2026-05-22)
// ============================================================
// news_posts 에는 NOT NULL 컬럼이 source_id / category / slug 등 6종 있고,
// 누락 시 insert 가 silent fail → 시·군 collector 27개 + Playwright runner
// 모두 prod row 0건 사고 (2026-05-22 audit 발견).
//
// 표준 패턴:
//   source_id = sha256(source_url).slice(0, 16)       — 결정적 dedupe key
//   slug      = `${title 정리}-${cityKey}-${source_id}` — UNIQUE 위반 시 23505 skip
//   category  = "news"                                 — naver-news / local-press 공통
//
// UNIQUE constraints (news_posts):
//   - slug 단독
//   - (source_code, source_id) 복합
// ============================================================

import { createHash } from "node:crypto";

/**
 * source_url 으로부터 결정적 16자 hex source_id 생성.
 * 같은 url → 같은 id → (source_code, source_id) UNIQUE 위반 시 23505 skip.
 */
export function makeNewsSourceId(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
}

/**
 * news_posts.slug 결정적 생성 — title + cityKey + source_id 결합.
 * naver-news 의 deterministicSlug 와 같은 패턴.
 */
export function makeNewsSlug(
  title: string,
  cityKey: string,
  sourceId: string,
): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
  return `${base}-${cityKey}-${sourceId}`.slice(0, 130);
}
