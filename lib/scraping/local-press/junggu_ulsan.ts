// ============================================================
// 울산 중구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /board/list.ulsan?boardId=BBS_0000090&menuCd=DOM_000000102003002000
// 목록: RFC3 press_list cards, dataSid detail link
// 상세: board_view > h4.subject/view_info/b_con visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.junggu.ulsan.kr";
const BOARD_ID = "BBS_0000090";
const MENU_CD = "DOM_000000102003002000";
const ORDER_BY = "TMP_FIELD4 DESC,REGISTER_DATE DESC";
const LIST_URL = `${BASE_URL}/board/list.ulsan?boardId=${BOARD_ID}&menuCd=${MENU_CD}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/gi, " $1 ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\n\u00a0]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const m = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function makeDetailUrl(dataSid: string): string {
  const params = new URLSearchParams({
    boardId: BOARD_ID,
    menuCd: MENU_CD,
    orderBy: ORDER_BY,
    paging: "ok",
    startPage: "1",
    dataSid,
  });
  return `${BASE_URL}/board/view.ulsan?${params.toString()}`;
}

function extractDivByClass(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openMatch.index;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openMatch.index + openMatch[0].length, match.index);
    } else {
      depth += 1;
    }
  }
  return html.slice(openMatch.index + openMatch[0].length);
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>\s*<\/div>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRe.exec(html)) !== null) {
    const item = itemMatch[1];
    const linkMatch = /<a\b[^>]*href=["']([^"']*\bdataSid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(item);
    if (!linkMatch) continue;
    const seq = linkMatch[2];
    if (!seq || seen.has(seq)) continue;

    const titleMatch = /<dt\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(item);
    const title = stripTags(titleMatch?.[1] ?? linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateText = stripTags(/작성일\s*[:：]?\s*(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/i.exec(item)?.[1] ?? item);
    const publishedDate = normalizeDate(dateText);

    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeDetailUrl(seq) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const viewHtml = extractDivByClass(html, "board_view");
  if (!viewHtml) return null;

  const title = stripTags(/<h4\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i.exec(viewHtml)?.[1] ?? "");
  const info = stripTags(/<ul\b[^>]*class=["'][^"']*\bview_info\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(viewHtml)?.[1] ?? "");
  const bodyHtml = extractDivByClass(viewHtml, "b_con") ?? viewHtml;
  const body = [title, info, stripTags(bodyHtml)].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "울산 중구",
  region: "울산",
  ministry: "울산 중구청",
  sourceOutlet: "울산 중구청",
  sourceCode: "local-press-junggu-ulsan",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeJungguUlsanAndInsert = collector.scrapeAndInsert;
