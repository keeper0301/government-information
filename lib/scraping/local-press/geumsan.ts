// ============================================================
// 충남 금산군 금산홍보관 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /media/html/sub01/0102.html
// 목록: ?mode=V&nes_dta_key={32hex}
// 상세: /media/html/sub01/0102.html?mode=V&nes_dta_key={32hex}
// 본문: div.ui.bbs--view--content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.geumsan.go.kr";
const LIST_PATH = "/media/html/sub01/0102.html";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const DETAIL_LINK_REGEX = /<a\b[^>]*href=["']\?mode=V(?:&amp;|&)nes_dta_key=([a-f0-9]{32})["'][^>]*>([\s\S]*?)<\/a>/gi;
const LIST_DATE_REGEX = /등록일\s*(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<h2\b[^>]*class=["'][^"']*\bui bbs--view--tit\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\binq_cnt\b[^"']*["'][^>]*>\s*<i>등록일<\/i>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;
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
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTitle(text: string): string {
  const lines = text
    .split(/\n|\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines[0] ?? text)
    .replace(/작성자\s+.*$/g, "")
    .replace(/등록일\s+\d{4}-\d{2}-\d{2}.*$/g, "")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${LIST_URL}?mode=V&nes_dta_key=${seq}`;
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
    seen.add(seq);

    const text = stripHtml(match[2]);
    const title = normalizeTitle(text);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

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
    new RegExp(CONTENT_MARKER_REGEX.source, "gi"),
  )
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeGeumsanAndInsert } = createPressCollector({
  cityName: "충남 금산군",
  region: "충남",
  ministry: "충남 금산군청",
  sourceOutlet: "충남 금산군청",
  sourceCode: "local-press-geumsan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
