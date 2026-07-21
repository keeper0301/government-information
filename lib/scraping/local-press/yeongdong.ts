// ============================================================
// 충북 영동군청 헤드라인뉴스 수집 (2026-07-21) — 충북권 확장
// ============================================================
// 공식 뉴스·해명 > 헤드라인뉴스: /kr/html/sub02/02010601.html
// 목록: bd_boxtype 카드 href '?mode=V&no={hash}&GotoPage=1'
// 상세: /kr/html/sub02/02010601.html?mode=V&no={hash}&GotoPage=1
// 본문: ui bbs--view--cont / bbs--view--content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yd21.go.kr";
const LIST_URL = `${BASE_URL}/kr/html/sub02/02010601.html`;

const CARD_REGEX = /<div class=['"]bd_boxtype bd_item bd_shadow bd_curved['"][^>]*>([\s\S]*?)(?=<div class=['"]bd_boxtype bd_item bd_shadow bd_curved['"]|<div class=['"]pagination|<div class=['"]paging|<form|$)/g;
const LINK_REGEX = /<a\s+href=['"]\?mode=V(?:&amp;|&)no=([a-f0-9]+)(?:&amp;|&)GotoPage=\d+['"][^>]*>/i;
const TITLE_REGEX = /<h2>\s*<span>([\s\S]*?)<\/span>\s*<\/h2>/i;
const DATE_REGEX = /<span class=['"]date['"]>(\d{4})-(\d{2})-(\d{2})<\/span>/i;
const DETAIL_TITLE_REGEX = /<h2 class=['"]ui bbs--view--tit['"]>([\s\S]*?)<\/h2>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractContentDivs(html: string): string[] {
  const blocks: string[] = [];
  const marker = /<div class=['"]ui bbs--view--content['"][^>]*>/g;
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

  let match: RegExpExecArray | null;
  const cardRe = new RegExp(CARD_REGEX.source, "g");
  while ((match = cardRe.exec(html)) !== null) {
    const card = match[1];
    const link = LINK_REGEX.exec(card);
    if (!link) continue;

    const seq = link[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(TITLE_REGEX.exec(card)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(card);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${LIST_URL}?mode=V&no=${seq}&GotoPage=1`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const blocks = extractContentDivs(html)
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  const normalized = title && !body.startsWith(title) ? `${title}\n\n${body}` : body;
  return normalized.slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeYeongdongAndInsert } = createPressCollector({
  cityName: "충북 영동군",
  region: "충북",
  ministry: "충북 영동군청",
  sourceOutlet: "충북 영동군청",
  sourceCode: "local-press-yeongdong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
