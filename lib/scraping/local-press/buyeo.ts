// ============================================================
// 충남 부여군청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /_prog/_board/?code=news_07&site_dvs_cd=kr&menu_dvs_cd=0408
// 목록/상세: mode=V&no={board id}&code=news_07
// 본문: div.board_viewDetail
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.buyeo.go.kr";
const LIST_PATH = "/_prog/_board/";
const BOARD_QUERY = "code=news_07&site_dvs_cd=kr&menu_dvs_cd=0408";
const LIST_URL = `${BASE_URL}${LIST_PATH}?${BOARD_QUERY}`;

const ITEM_REGEX = /<div\b[^>]*class=["'][^"']*\bbodo_listThum\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bbodo_listThum\b|<div\b[^>]*class=["'][^"']*\bpaginate\b|<\/div>\s*<\/div>\s*<!--\s*게시판 리스트|$)/gi;
const DETAIL_HREF_REGEX = /href=["']\.\/\?mode=V(?:&amp;|&)no=([^&"']+)(?:&amp;|&)code=news_07[^"']*["']/i;
const TITLE_ATTR_REGEX = /<a\b[^>]*title=["']([^"']+)["'][^>]*>/i;
const LIST_DATE_REGEX = /작성일\s*[:：]?\s*(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["']board_viewTit["'][^>]*>\s*<h4[^>]*>([\s\S]*?)<\/h4>\s*<\/div>/i;
const DETAIL_DATE_REGEX = /<li\b[^>]*class=["']date["'][^>]*>\s*<span>작성일<\/span>\s*(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_BODY_MARKER_REGEX = /<div\b[^>]*class=["']board_viewDetail["'][^>]*>/gi;

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
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}${LIST_PATH}?mode=V&no=${encodeURIComponent(seq)}&${BOARD_QUERY}`;
}

function extractBalancedDivs(html: string, marker: RegExp): string[] {
  const blocks: string[] = [];
  marker.lastIndex = 0;

  while (marker.exec(html) !== null) {
    let depth = 1;
    const cursor = marker.lastIndex;
    const token = /<\/div\s*>|<div\b[^>]*>/gi;
    token.lastIndex = cursor;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = token.exec(html)) !== null) {
      if (tokenMatch[0].startsWith("</")) depth -= 1;
      else depth += 1;
      if (depth === 0) {
        blocks.push(html.slice(cursor, tokenMatch.index));
        marker.lastIndex = token.lastIndex;
        break;
      }
    }
  }

  return blocks;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let itemMatch: RegExpExecArray | null;
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  while ((itemMatch = itemRe.exec(html)) !== null) {
    const block = itemMatch[1];
    const hrefMatch = DETAIL_HREF_REGEX.exec(block);
    if (!hrefMatch) continue;

    const seq = decodeBasicEntities(hrefMatch[1]);
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(TITLE_ATTR_REGEX.exec(block)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const text = stripHtml(block);
    const dateMatch = LIST_DATE_REGEX.exec(text);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: makeDetailUrl(seq),
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

  const blocks = extractBalancedDivs(
    html,
    new RegExp(DETAIL_BODY_MARKER_REGEX.source, "gi"),
  )
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeBuyeoAndInsert } = createPressCollector({
  cityName: "충남 부여군",
  region: "충남",
  ministry: "충남 부여군청",
  sourceOutlet: "충남 부여군청",
  sourceCode: "local-press-buyeo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
