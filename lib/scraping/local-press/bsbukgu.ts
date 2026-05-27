// ============================================================
// 부산 북구청 보도자료 수집 (2026-05-27) — 부산 자치구 batch
// ============================================================
// 부산 북구 인구 29만. 부산진·금정·동래 동일 SI CMS.
// list: /board/list.bsbukgu?boardId=BBS_0000001&menuCd=DOM_000000103001005000
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.bsbukgu.go.kr";
const LIST_URL =
  "https://www.bsbukgu.go.kr/board/list.bsbukgu?boardId=BBS_0000001&menuCd=DOM_000000103001005000";

const LIST_ITEM_REGEX =
  /<a[^>]*href="(\/board\/view\.bsbukgu\?[^"]*boardId=BBS_0000001[^"]*dataSid=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2}|\d{2}\.\d{2}\.\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:contents|view_cont|board_view|bbs_view|cont_box|view_content|board_view_body)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach|view_list)|<\/article|<\/section)/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[2];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(
      m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    ).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const slice = html.slice(m.index, m.index + 1500);
    const dateMatch = new RegExp(DATE_REGEX.source).exec(slice);
    let publishedDate: string | null = null;
    if (dateMatch) {
      const raw = dateMatch[1].replace(/\./g, "-");
      publishedDate = /^\d{2}-/.test(raw) ? `20${raw}` : raw;
    }
    const path = m[1].replace(/&amp;/g, "&");
    const fullUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: fullUrl,
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

export const { scrapeAndInsert: scrapeBsbukguAndInsert } = createPressCollector(
  {
    cityName: "부산 북구",
    region: "부산",
    ministry: "부산 북구청",
    sourceOutlet: "부산 북구청",
    sourceCode: "local-press-bsbukgu",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
