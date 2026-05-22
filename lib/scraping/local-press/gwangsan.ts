// ============================================================
// 광산구청 보도자료 수집 (2026-05-22) — 광주광역시 자치구 1번째
// ============================================================
// 광산구 인구 40만. 광주광역시 (gwangju.ts) 와 동일 system (boardList/boardView).
//   - boardId: REPORT_NEW · pageId: www16
//
// URL:
//   list:   /boardList.do?boardId=REPORT_NEW&pageId=www16
//   상세:   /boardView.do?boardId=REPORT_NEW&pageId=www16&seq=N
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gwangsan.go.kr";
const LIST_URL =
  "https://www.gwangsan.go.kr/boardList.do?boardId=REPORT_NEW&pageId=www16";

// 광주광역시 패턴 — subject div 또는 title attr
const LIST_ITEM_REGEX =
  /<div\s+class="subject">[\s\S]*?<a\s+href="[^"]*&(?:amp;)?seq=(\d+)[^"]*"[^>]*title="([^"]+)"/g;

const DATE_REGEX = /class="date">[\s\S]*?(\d{4}-\d{2}-\d{2})</g;

// 광주 5/22 fix 패턴 — board_view_body + add_file 끝점
const BODY_CONTAINER_REGEX =
  /<div\s+class="board_view_body[^"]*"[^>]*>([\s\S]*?)<div\s+class="add_file"/i;
const BODY_CONTAINER_REGEX_LEGACY =
  /<div\s+class="board_view_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const dates: string[] = [];

  let m: RegExpExecArray | null;
  const itemRe = new RegExp(LIST_ITEM_REGEX.source, "g");
  let idx = 0;
  while ((m = itemRe.exec(html)) !== null) {
    const seq = m[1];
    if (seen.has(seq)) continue;
    seen.add(seq);
    const title = decodeBasicEntities(m[2]).trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    items.push({
      seq,
      title,
      publishedDate: null,
      sourceUrl: `${BASE_URL}/boardView.do?boardId=REPORT_NEW&pageId=www16&seq=${seq}`,
    });
    idx += 1;
  }

  const dateRe = new RegExp(DATE_REGEX.source, "g");
  while ((m = dateRe.exec(html)) !== null) {
    dates.push(m[1]);
  }

  return items.map((it, i) => ({
    seq: it.seq,
    title: it.title,
    publishedDate: dates[i] ?? null,
    sourceUrl: it.sourceUrl,
  }));
}

export function parseDetailBody(html: string): string | null {
  const m =
    BODY_CONTAINER_REGEX.exec(html) ?? BODY_CONTAINER_REGEX_LEGACY.exec(html);
  if (!m) return null;
  const text = decodeBasicEntities(m[1])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[가-힣]/.test(text) || text.length < 50) return null;
  return text.slice(0, 5000);
}

export const { scrapeAndInsert: scrapeGwangsanAndInsert } = createPressCollector(
  {
    cityName: "광산구",
    region: "광주",
    ministry: "광산구청",
    sourceOutlet: "광산구청",
    sourceCode: "local-press-gwangsan",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  },
);
