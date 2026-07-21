// ============================================================
// 충남 당진시청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /cop/bbs/BBSMSTR_000000000014/selectBoardList.do
// 목록: div.bodo_list > div.item, selectBoardArticle.do?nttId={id}
// 상세: /cop/bbs/BBSMSTR_000000000014/selectBoardArticle.do?nttId={id}
// 본문: left bbs-view-content bbs-view-content-skin07
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dangjin.go.kr";
const LIST_URL = `${BASE_URL}/cop/bbs/BBSMSTR_000000000014/selectBoardList.do`;

const ITEM_REGEX = /<div\b[^>]*class=["']item["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["']item["']|<div\b[^>]*class=["']pagination|<div\b[^>]*class=["']paging|<form|$)/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*BBSMSTR_000000000014\/selectBoardArticle\.do\?nttId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const SUBJECT_REGEX = /<div\b[^>]*class=["']subject["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i;
const LIST_DATE_REGEX = /<span\b[^>]*class=["']date["'][^>]*>[\s\S]*?(\d{4})\.(\d{2})\.(\d{2})[\s\S]*?<\/span>/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["']bbs_detail_tit["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<li\b[^>]*class=["']date["'][^>]*>\s*등록일\s*:\s*(\d{4})-(\d{2})-(\d{2})\s*<\/li>/i;
const CONTENT_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs-view-content\b[^"']*["'][^>]*>/gi;

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
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/cop/bbs/BBSMSTR_000000000014/selectBoardArticle.do?nttId=${seq}`;
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

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  while ((match = itemRe.exec(html)) !== null) {
    const itemHtml = match[1];
    const link = LINK_REGEX.exec(itemHtml);
    if (!link) continue;

    const seq = link[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(SUBJECT_REGEX.exec(itemHtml)?.[1] ?? link[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(itemHtml);
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
    new RegExp(CONTENT_MARKER_REGEX.source, "gi"),
  )
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeDangjinAndInsert } = createPressCollector({
  cityName: "충남 당진시",
  region: "충남",
  ministry: "충남 당진시청",
  sourceOutlet: "충남 당진시청",
  sourceCode: "local-press-dangjin",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
