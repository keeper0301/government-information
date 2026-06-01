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

// 2026-06-01 fix — 관악 동일 sentinel 단순화 (closing pattern specific 사고 회피)
const BODY_CONTAINER_REGEX =
  /<div[^>]*class="view_contents"[^>]*>([\s\S]{50,40000}?)<div\s+class="view-nuri/i;

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
  const m = BODY_CONTAINER_REGEX.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
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
