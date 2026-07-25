// ============================================================
// 부산 서구 보도/해명 자료 수집 (2026-07-25)
// ============================================================
// 공식 보도/해명 자료: /board/list.bsseogu?boardId=BBS_0000011&menuCd=DOM_000000103001015000
// 목록/상세: RFC3 board/list.bsseogu + board/view.bsseogu, dataSid detail id
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.bsseogu.go.kr";
const BOARD_ID = "BBS_0000011";
const MENU_CD = "DOM_000000103001015000";
const CONTENTS_SID = "880";
const LIST_URL = `${BASE_URL}/board/list.bsseogu?boardId=${BOARD_ID}&menuCd=${MENU_CD}&contentsSid=${CONTENTS_SID}&cpath=`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LIST_LINK_REGEX = /<td\b[^>]*class=["'][^"']*\bl\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/board\/view\.bsseogu[^"']*\bboardId=BBS_0000011[^"']*\bdataSid=([^&"']+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const ROW_DATE_REGEX = /<td\b[^>]*>\s*(\d{4})\.\s*(\d{2})\.\s*(\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bboard-view-wrap\b[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i;
const DETAIL_DATE_REGEX = /<ul\b[^>]*class=["'][^"']*\binfo\b[^"']*["'][^>]*>[\s\S]*?<li>\s*(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_BODY_START_REGEX = /<div\b[^>]*class=["'][^"']*\bcon\b[^"']*["'][^>]*>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<div\b[^>]*class=["'][^"']*\bdoc-file\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<div\b[^>]*class=["'][^"']*\bslide-photo\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

function extractBalancedDiv(html: string, startTagMatch: RegExpExecArray | null): string {
  if (!startTagMatch) return "";
  const openEnd = startTagMatch.index + startTagMatch[0].length;
  let depth = 1;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(openEnd, match.index);
  }
  return html.slice(openEnd);
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = ROW_REGEX.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = LIST_LINK_REGEX.exec(rowHtml);
    const dateMatch = ROW_DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(linkMatch[3]).replace(/^\[?보도\/?해명자료\]?\s*/i, "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      sourceUrl: makeAbsoluteUrl(linkMatch[1]),
    });
  }
  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const bodyHtml = extractBalancedDiv(html, DETAIL_BODY_START_REGEX.exec(html));
  const body = stripHtml(bodyHtml);
  const datePrefix = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeBsseoguAndInsert } = createPressCollector({
  cityName: "부산 서구",
  region: "부산",
  ministry: "부산 서구청",
  sourceOutlet: "부산 서구청",
  sourceCode: "local-press-bsseogu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
