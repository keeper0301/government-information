// ============================================================
// 광주 서구청 보도자료 수집 (2026-05-25) — 광주 자치구 batch
// ============================================================
// 광주 서구 인구 30만. board.es CMS (mid=c50501000000&bid=0154).
//
// URL:
//   list:   /board.es?mid=c50501000000&bid=0154
//   상세:   /board.es?mid=c50501000000&bid=0154&act=view&list_no={N}
//
// 남구·북구와 다른 점: a tag title attribute X. inner text 으로 title 추출.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.seogu.gwangju.kr";
const LIST_URL =
  "https://www.seogu.gwangju.kr/board.es?mid=c50501000000&bid=0154";

// title 없으므로 inner text 으로 추출.
const LIST_ITEM_REGEX =
  /<a[^>]*href="\/board\.es\?[^"]*list_no=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|board_view_body|cont_box|view_content|p-view__cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|p-view__bottom)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    // inner content 안 <i>, <span class="sr_only">새글</span> 등 tag 제거 후 title 추출
    const title = decodeBasicEntities(
      m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\//g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/board.es?mid=c50501000000&bid=0154&act=view&list_no=${seq}`,
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

export const { scrapeAndInsert: scrapeSeoguGwangjuAndInsert } =
  createPressCollector({
    cityName: "광주 서구",
    region: "광주",
    ministry: "광주 서구청",
    sourceOutlet: "광주 서구청",
    sourceCode: "local-press-seogu-gwangju",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
