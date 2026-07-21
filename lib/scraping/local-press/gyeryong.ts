// ============================================================
// 충남 계룡시청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /kr/html/sub03/030105.html
// 목록: href '?mode=V&no={hash}&GotoPage=1'
// 상세: /kr/html/sub03/030105.html?mode=V&no={hash}&GotoPage=1
// 본문: ui bbs--view--content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gyeryong.go.kr";
const LIST_URL = `${BASE_URL}/kr/html/sub03/030105.html`;

const DETAIL_LINK_REGEX = /<a\b[^>]*href=["']\?mode=V(?:&amp;|&)no=([a-f0-9]{32})(?:&amp;|&)GotoPage=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
const LIST_TITLE_REGEX = /<strong\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i;
const LIST_DATE_REGEX = /<li\b[^>]*class=["'][^"']*\bregDate\b[^"']*["'][^>]*>[\s\S]*?(\d{4})-(\d{2})-(\d{2})[\s\S]*?<\/li>/i;
const DETAIL_TITLE_REGEX = /<h2\b[^>]*class=["'][^"']*\bui bbs--view--tit\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\binq_cnt\b[^"']*["'][^>]*>\s*<i>등록일<\/i>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/span>/i;
const CONTENT_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bui bbs--view--content\b[^"']*["'][^>]*>/gi;

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
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(text: string): string {
  return text
    .replace(/\s+작성자\s+[\s\S]*$/, "")
    .replace(/\s+-\s+[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${LIST_URL}?mode=V&no=${seq}&GotoPage=1`;
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
  const linkRe = new RegExp(DETAIL_LINK_REGEX.source, "gi");
  while ((match = linkRe.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;

    const linkHtml = match[2];
    const text = stripHtml(linkHtml);
    const title =
      stripHtml(LIST_TITLE_REGEX.exec(linkHtml)?.[1] ?? "") ||
      normalizeTitle(text);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(linkHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    seen.add(seq);
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

export const { scrapeAndInsert: scrapeGyeryongAndInsert } = createPressCollector({
  cityName: "충남 계룡시",
  region: "충남",
  ministry: "충남 계룡시청",
  sourceOutlet: "충남 계룡시청",
  sourceCode: "local-press-gyeryong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
