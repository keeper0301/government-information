// ============================================================
// 양천구청 보도자료 수집 (2026-05-31) — 서울 18 자치구 확장 패턴 2
// ============================================================
// 관악과 동일한 eGovFrame site/{slug}/ex/bbs (cbIdx=290) — onclick dispatch.
//
// URL:
//   list:   /site/yangcheon/ex/bbs/List.do?cbIdx=290
//   상세:   /site/yangcheon/ex/bbs/View.do?cbIdx=290&bcIdx={N}
//
// body: <div class="view_contents"> — 관악 동일 구조
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yangcheon.go.kr";
const LIST_URL = `${BASE_URL}/site/yangcheon/ex/bbs/List.do?cbIdx=290`;

const LIST_ITEM_REGEX =
  /<a\s+href="#view"\s+onclick="doBbsFView\('290','(\d+)'[^"]*"[^>]*title="([^"]*)"[^>]*>/g;

const DATE_REGEX = /<td\s+class="wdate">\s*(\d{4})\.(\d{2})\.(\d{2})/;

// 2026-06-02 fix — 종결 마커 `view-nuri` 가 양천 detail 에 없어 매칭 실패(수집 0).
// view_contents div 를 깊이 추적으로 추출(중첩 div 안전 + 종결 마커 의존 제거). 1738자 검증.
const VIEW_CONTENTS_OPEN = /<div[^>]*\bclass="[^"]*\bview_contents\b[^"]*"[^>]*>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).replace(/\s+/g, " ").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 2500);
    const dateMatch = DATE_REGEX.exec(slice);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/site/yangcheon/ex/bbs/View.do?cbIdx=290&bcIdx=${seq}`,
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const open = VIEW_CONTENTS_OPEN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let raw: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        raw = html.slice(start, m.index);
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (raw === null) return null;
  const text = decodeBasicEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 길이 하한은 factory(BODY_MIN_LEN 250)에 일임 — 한글 본문 여부만 게이트.
  return /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeYangcheonAndInsert } =
  createPressCollector({
    cityName: "양천구",
    region: "서울",
    ministry: "양천구청",
    sourceOutlet: "양천구청",
    sourceCode: "local-press-yangcheon",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
