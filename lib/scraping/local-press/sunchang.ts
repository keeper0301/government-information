// ============================================================
// 전북 순창군청 보도자료 수집 (2026-07-22) — 전북권 확장
// ============================================================
// 공식 보도자료: /board/post/list.do?boardUid=ff8080819a2f0e3b019a71a46284217a&menuUid=ff8080819a2f0e3b019a5d1bb7da1652
// 목록: gallery_list/list_4vs4 cards + postUid detail link
// 상세: div.view_table metadata + div.view_con body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.sunchang.go.kr";
const BOARD_UID = "ff8080819a2f0e3b019a71a46284217a";
const MENU_UID = "ff8080819a2f0e3b019a5d1bb7da1652";
const LIST_URL = `${BASE_URL}/board/post/list.do?boardUid=${BOARD_UID}&menuUid=${MENU_UID}`;

const CARD_REGEX = /<li>\s*<a\b[^>]*href=["']([^"']*\/board\/post\/view\.do[^"']*\bboardUid=ff8080819a2f0e3b019a71a46284217a[^"']*\bpostUid=([^&"']+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
const CARD_TITLE_REGEX = /<dt>\s*<strong>([\s\S]*?)<\/strong>\s*<\/dt>/i;
const CARD_DATE_REGEX = /<dd\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>[\s\S]*?작성일[\s\S]*?(\d{4})-(\d{2})-(\d{2})[\s\S]*?<\/dd>/i;
const DETAIL_TITLE_REGEX = /<p\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i;
const DETAIL_DATE_REGEX = /<li>\s*<strong>\s*작성일\s*<\/strong>\s*<span>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>\s*<\/li>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bview_con\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bfile_box\b/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<p\b[^>]*class=["'][^"']*\bimg\b[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, " ")
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

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const cardRe = new RegExp(CARD_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = cardRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    const cardHtml = match[3];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(CARD_TITLE_REGEX.exec(cardHtml)?.[1] ?? "");
    const dateMatch = CARD_DATE_REGEX.exec(cardHtml);
    if (!title || title.length < 5 || !/[가-힣]/.test(title) || !dateMatch) {
      continue;
    }

    items.push({
      seq,
      title,
      publishedDate: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      sourceUrl: makeAbsoluteUrl(href),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeSunchangAndInsert } = createPressCollector({
  cityName: "전북 순창군",
  region: "전북",
  ministry: "전북 순창군청",
  sourceOutlet: "전북 순창군청",
  sourceCode: "local-press-sunchang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
