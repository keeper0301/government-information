// ============================================================
// 인천 미추홀구청 보도자료 수집 (2026-05-26)
// ============================================================
// 인천 미추홀구 인구 41만. board/view.do?sq=N&board_code=news_item CMS.
// 다른 인천 자치구 와 다른 CMS — 단독 collector.
//
// URL:
//   list:   /main/board/list.do?board_code=news_item
//   상세:   /main/board/view.do?sq=N&board_code=news_item
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.michuhol.go.kr";
const LIST_URL =
  "https://www.michuhol.go.kr/main/board/list.do?board_code=news_item";

const LIST_ITEM_REGEX =
  /<a[^>]*href="[^"]*view\.do\?[^"]*sq=(\d+)[^"]*board_code=news_item[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|board_view_body|cont_box|view_content|content)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach)|<\/article|<\/section)/i;

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
      m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch ? dateMatch[1].replace(/\./g, "-") : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/main/board/view.do?sq=${seq}&board_code=news_item`,
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

export const { scrapeAndInsert: scrapeMichuholAndInsert } =
  createPressCollector({
    cityName: "미추홀구",
    region: "인천",
    ministry: "미추홀구청",
    sourceOutlet: "미추홀구청",
    sourceCode: "local-press-michuhol",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
