// ============================================================
// 충남 논산시청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /kor/html/sub03/030106.html
// 목록: href '?mode=V&no={hash}'
// 상세: /kor/html/sub03/030106.html?mode=V&no={hash}
// 본문: bd_detail_cont 중 본문 블록
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.nonsan.go.kr";
const LIST_URL = `${BASE_URL}/kor/html/sub03/030106.html`;

const DETAIL_LINK_REGEX = /<a\b[^>]*href=["']\?mode=V(?:&amp;|&)no=([a-f0-9]{32})(?:[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bbd_detail_tit\b[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<li\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*등록일\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/li>/i;
const CONTENT_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bbd_detail_cont\b[^"']*["'][^>]*>/gi;

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
    .replace(/\s*자세히보기\s*$/i, "")
    .replace(/\s+[가-힣]+(?:실|과|관|소|센터)\s+\d{4}-\d{2}-\d{2}\s+\d+\s*$/,
      "",
    )
    .replace(/\s+-\s+[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${LIST_URL}?mode=V&no=${seq}`;
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

    const text = stripHtml(match[2]);
    const title = normalizeTitle(text);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(text);
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

export const { scrapeAndInsert: scrapeNonsanAndInsert } = createPressCollector({
  cityName: "충남 논산시",
  region: "충남",
  ministry: "충남 논산시청",
  sourceOutlet: "충남 논산시청",
  sourceCode: "local-press-nonsan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
