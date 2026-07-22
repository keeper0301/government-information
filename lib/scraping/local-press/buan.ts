// ============================================================
// 전북 부안군청 언론보도 수집 (2026-07-22) — 전북권 확장
// ============================================================
// 공식 언론보도: /board/list.buan?boardId=BBS_0000059&menuCd=DOM_000000103002001000
// 목록: table.bbs_list_t rows + dataSid detail link
// 상세: div.bbs_vtop metadata + div.bbs_con body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.buan.go.kr";
const BOARD_ID = "BBS_0000059";
const MENU_CD = "DOM_000000103002001000";
const LIST_URL = `${BASE_URL}/board/list.buan?boardId=${BOARD_ID}&menuCd=${MENU_CD}&contentsSid=90&cpath=`;

const ROW_REGEX = /<tr>\s*([\s\S]*?)<\/tr>/gi;
const LIST_LINK_REGEX = /<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']*\/board\/view\.buan[^"']*\bboardId=BBS_0000059[^"']*\bdataSid=([^&"']+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const ROW_DATE_REGEX = /<td\b[^>]*data-cell-header=["']작성일["'][^>]*>\s*(\d{2})\.(\d{2})\.(\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_vtop\b[^"']*["'][^>]*>[\s\S]*?<h4>([\s\S]*?)<\/h4>/i;
const DETAIL_DATE_REGEX = /<li>\s*<strong>\s*작성일\s*<\/strong>\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/li>/i;
const DETAIL_BODY_START_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_con\b[^"']*["'][^>]*>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<figure\b[^>]*class=["'][^"']*\bbbs_img\b[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
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
  let depth = 1;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return html.slice(openEnd, match.index);
    }
  }
  return html.slice(openEnd);
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = LIST_LINK_REGEX.exec(rowHtml);
    const dateMatch = ROW_DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      sourceUrl: makeAbsoluteUrl(href),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const bodyHtml = extractBalancedDiv(html, DETAIL_BODY_START_REGEX.exec(html));
  const body = stripHtml(bodyHtml);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeBuanAndInsert } = createPressCollector({
  cityName: "전북 부안군",
  region: "전북",
  ministry: "전북 부안군청",
  sourceOutlet: "전북 부안군청",
  sourceCode: "local-press-buan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
