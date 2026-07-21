// ============================================================
// 전북 완주군청 보도자료 수집 (2026-07-21) — 전북권 확장
// ============================================================
// 공식 보도자료: /news/planweb/board/list.9is?contentUid=...&boardUid=...
// 목록: div.thumb_info1 카드 + view.9is dataUid detail link
// 상세: div.view-table metadata + div.view-con body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.wanju.go.kr";
const CONTENT_UID = "ff808081898ba9ba0189f1e5b91101a9";
const BOARD_UID = "ff8080818b024d8e018b1c99655f1226";
const LIST_URL = `${BASE_URL}/news/planweb/board/list.9is?contentUid=${CONTENT_UID}&boardUid=${BOARD_UID}`;

const MORE_HREF_REGEX = /<dd\b[^>]*class=["'][^"']*\bthumb_more\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\bdataUid=([0-9a-f]+)[^"']*)["'][^>]*>/gi;
const TITLE_REGEX = /<dt\b[^>]*>([\s\S]*?)<\/dt>/i;
const DATE_REGEX = /thumb_date[\s\S]*?(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_TITLE_REGEX = /<strong>\s*제목\s*<\/strong>\s*<span>([\s\S]*?)<\/span>/i;
const DETAIL_DATE_REGEX = /<strong>\s*등록일\s*<\/strong>\s*<span>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bview-con\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div\b[^>]*class=["'][^"']*\bbtnArea\b/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/dd>/gi, "\n")
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
    .replace(/\bMORE VIEW\b/gi, " ")
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

function normalizeTitle(titleHtml: string): string {
  return stripHtml(titleHtml.replace(/<span\b[^>]*>[\s\S]*?<\/span>/i, " "));
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const hrefRe = new RegExp(MORE_HREF_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = hrefRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const cardStart = html.lastIndexOf('<div class="thumb_info1">', match.index);
    const cardHtml = html.slice(Math.max(0, cardStart), match.index + match[0].length);

    const title = normalizeTitle(TITLE_REGEX.exec(cardHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(cardHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
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
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1] ?? "";
  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeWanjuAndInsert } = createPressCollector({
  cityName: "전북 완주군",
  region: "전북",
  ministry: "전북 완주군청",
  sourceOutlet: "전북 완주군청",
  sourceCode: "local-press-wanju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
