// ============================================================
// 부산진구청 보도자료 수집 (2026-05-25) — 부산 자치구 batch
// ============================================================
// 부산진구 인구 35만. 자체 CMS (`/board/list.busanjin?boardId=BBS_0000265`).
//
// URL:
//   list:   /board/list.busanjin?boardId=BBS_0000265&menuCd=DOM_000000103007004000
//   상세:   /board/view.busanjin?boardId=BBS_0000265&menuCd=...&dataSid={N}
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.busanjin.go.kr";
const LIST_URL =
  "https://www.busanjin.go.kr/board/list.busanjin?boardId=BBS_0000265&menuCd=DOM_000000103007004000";

const LIST_ITEM_REGEX =
  /<a[^>]*href="(\/board\/view\.busanjin\?[^"]*boardId=BBS_0000265[^"]*dataSid=(\d+)[^"]*)"[^>]*>([\s\S]{0,500}?)<\/a>/g;

const DATE_REGEX = /(\d{4}[.\-]\d{2}[.\-]\d{2}|\d{2}\.\d{2}\.\d{2})/g;

const BODY_CONTAINER_REGEX =
  /<div\s+class="(?:view_cont|board_view|bbs_view|cont_box|view_content|board_view_body)[^"]*"[^>]*>([\s\S]{50,40000}?)(?:<div\s+class="(?:btn|pagination|file|attach)|<\/article|<\/section)/i;

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
      // 2026-05-25 review fix: length 8 hard 가정 X. 첫 segment 가 2 자리면 20 prefix.
      // 25-5-15 (한자리 월) 같은 비표준 형식도 안전 처리.
      publishedDate = /^\d{2}-/.test(raw) ? `20${raw}` : raw;
    }
    const path = m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`;
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: path,
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

export const { scrapeAndInsert: scrapeBusanjinAndInsert } = createPressCollector(
  {
    cityName: "부산진구",
    region: "부산",
    ministry: "부산진구청",
    sourceOutlet: "부산진구청",
    sourceCode: "local-press-busanjin",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
