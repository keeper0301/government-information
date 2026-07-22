// ============================================================
// 전북 무주군청 보도자료 수집 (2026-07-22) — 전북권 확장
// ============================================================
// 공식 보도자료: /planweb/board/list.9is?contentUid=...&boardUid=...
// 목록: div.news_list li + view.9is dataUid detail link
// 상세: div.bd_detail_tit metadata + div.bd_detail_content body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.muju.go.kr";
const CONTENT_UID = "ff8080816c5f9d47016cbd3baf240074";
const BOARD_UID = "ff8080816d3d662f016d4218d1360434";
const LIST_URL = `${BASE_URL}/planweb/board/list.9is?contentUid=${CONTENT_UID}&boardUid=${BOARD_UID}`;

const ROW_REGEX = /<li>\s*<a\b[^>]*href=["']([^"']*\bdataUid=([0-9a-f]+)[^"']*\bboardUid=ff8080816d3d662f016d4218d1360434[^"']*)["'][^>]*>[\s\S]*?<span\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>\s*<span\b[^>]*class=["']date["'][^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/gi;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bbd_detail_tit\b[^"']*["'][^>]*>[\s\S]*?<h4\b[^>]*>([\s\S]*?)<\/h4>/i;
const DETAIL_DATE_REGEX = /<li\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*작성일\s*:\s*(\d{4})-(\d{2})-(\d{2})\s*<\/li>/i;
const DETAIL_BODY_START_REGEX = /<div\b[^>]*class=["'][^"']*\bbd_detail_content\b[^"']*["'][^>]*>/i;

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
    .replace(/;MUJU_JSESSIONID=[^?]+/g, "")
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

export const { scrapeAndInsert: scrapeMujuAndInsert } = createPressCollector({
  cityName: "전북 무주군",
  region: "전북",
  ministry: "전북 무주군청",
  sourceOutlet: "전북 무주군청",
  sourceCode: "local-press-muju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
