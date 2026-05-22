// ============================================================
// 충주시청 보도자료 수집 (2026-05-22)
// ============================================================
// 충주시 인구 21만. SI 표준 selectBbsNttList. 30,226+ 보도자료.
// a 안 nested content (photo div) 크기 위해 limit ↑.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.chungju.go.kr";
const LIST_URL =
  "https://www.chungju.go.kr/www/selectBbsNttList.do?bbsNo=6&key=494";

// limit 2000 (nested photo div 큼)
const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*selectBbsNttView\.do\?(?=[^"]*bbsNo=6)[^"]*?nttNo=(\d+)[^"]*"[^>]*>([\s\S]{0,2000}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:bbs_wrap|p-table__content|bbs__view|view_cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:p-table__bottom|btn|pagination)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 2500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?bbsNo=6&nttNo=${seq}&key=494`,
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
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeChungjuAndInsert } = createPressCollector(
  {
    cityName: "충주시",
    region: "충북",
    ministry: "충주시청",
    sourceOutlet: "충주시청",
    sourceCode: "local-press-chungju",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
