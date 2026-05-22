// ============================================================
// 광양시청 보도자료 수집 (2026-05-22) — 전남 batch
// ============================================================
// 광양시 인구 14만. board.es CMS (mid=a11007000000&bid=0057).
// 27,607+ 보도자료. 사장님 거주지 (전남) 인접.
//
// URL:
//   list:   /board.es?mid=a11007000000&bid=0057
//   상세:   /board.es?mid=a11007000000&bid=0057&act=view&list_no=N
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://gwangyang.go.kr";
const LIST_URL =
  "https://gwangyang.go.kr/board.es?mid=a11007000000&bid=0057";

// title 은 a 안 nested span (새글) 다음 텍스트. 0,500 limit + tag strip.
const LIST_ITEM_REGEX =
  /<a[^>]*href="\/board\.es\?mid=a11007000000&(?:amp;)?bid=0057&(?:amp;)?act=view&(?:amp;)?list_no=(\d+)[^"]*"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|board_view_body|cont_box|contents|p-view__cont)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|p-view__bottom)|<\/article|<\/section)/i;

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
    const publishedDate = dateMatch
      ? dateMatch[1].replace(/\./g, "-")
      : null;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/board.es?mid=a11007000000&bid=0057&act=view&list_no=${seq}`,
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

export const { scrapeAndInsert: scrapeGwangyangAndInsert } =
  createPressCollector({
    cityName: "광양시",
    region: "전남",
    ministry: "광양시청",
    sourceOutlet: "광양시청",
    sourceCode: "local-press-gwangyang",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
