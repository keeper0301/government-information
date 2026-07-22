// ============================================================
// 전북 장수군청 언론보도 수집 (2026-07-22) — 전북권 확장
// ============================================================
// 공식 언론보도: /board/list.jangsu?boardId=BBS_0000041&menuCd=DOM_000000102001012000
// 목록: table.list01 rows + board/view.jangsu dataSid detail link
// 상세: div.boardViewWrap metadata + div.bdvCntWrap body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jangsu.go.kr";
const BOARD_ID = "BBS_0000041";
const MENU_CD = "DOM_000000102001012000";
const LIST_URL = `${BASE_URL}/board/list.jangsu?boardId=${BOARD_ID}&menuCd=${MENU_CD}&orderBy=REGISTER_DATE%20DESC&paging=ok&startPage=1`;

const ROW_REGEX = /<tr\b[^>]*>[\s\S]*?<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']*\bboardId=BBS_0000041[^"']*\bdataSid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<td\b[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/td>/gi;
const DETAIL_TITLE_REGEX = /<p\b[^>]*class=["'][^"']*\bbdvTit\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i;
const DETAIL_DATE_REGEX = /<dt>\s*등록일\s*<\/dt>\s*<dd>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/dd>/i;
const DETAIL_BODY_START_REGEX = /<div\b[^>]*class=["'][^"']*\bbdvCntWrap\b[^"']*["'][^>]*>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|\b새글\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&").replace(/&&/g, "&"), LIST_URL)
    .toString()
    .replace(/&&/g, "&");
}

function extractBalancedDiv(html: string, startTagMatch: RegExpExecArray | null): string {
  if (!startTagMatch) return "";
  const openEnd = startTagMatch.index + startTagMatch[0].length;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let depth = 1;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = tagRe.exec(html)) !== null) {
    if (tagMatch[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd, tagMatch.index);
    } else {
      depth += 1;
    }
  }

  return html.slice(openEnd);
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(match[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${match[4]}-${match[5]}-${match[6]}`,
      sourceUrl: makeAbsoluteUrl(href),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const bodyHtml = extractBalancedDiv(html, DETAIL_BODY_START_REGEX.exec(html));
  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJangsuAndInsert } = createPressCollector({
  cityName: "전북 장수군",
  region: "전북",
  ministry: "전북 장수군청",
  sourceOutlet: "전북 장수군청",
  sourceCode: "local-press-jangsu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
