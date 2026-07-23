// ============================================================
// 전남광주통합특별시 진도군청 군정소식 수집 (2026-07-23)
// ============================================================
// 공식 군정소식: /home/board/B0016.cs?m=626
// 목록: ul.news_list > li.thumb_news
// 상세: div.board_view 안의 view_head 제목 + view_body 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://jindo.go.kr";
const LIST_PATH = "/home/board/B0016.cs?m=626";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ITEM_REGEX = /<li\b[^>]*class=["'][^"']*\bthumb_news\b[^"']*["'][^>]*>([\s\S]*?)<\/li>\s*<!--\s*\/\/\s*news_item\s*-->/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\barticleId=(\d+)[^"']*)["'][^>]*>/i;
const TITLE_REGEX = /<em\b[^>]*class=["'][^"']*\bnews_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/em>/i;
const DATE_REGEX = /작성일\s*:\s*(\d{4}-\d{2}-\d{2})/i;
const VIEW_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_view\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["'][^"']*\bboard_button\b|<div\b[^>]*class=["'][^"']*\bview_btn\b|<form\b[^>]*name=["']board)/i;
const DETAIL_TITLE_REGEX = /<dl\b[^>]*class=["'][^"']*\bview_head\b[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*\btxt\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bview_body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
const HTML_TITLE_REGEX = /<title>([\s\S]*?)\s*\|\s*상세\s*\|[\s\S]*?<\/title>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class=["'][^"']*\bstyCategory\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<span\b[^>]*class=["'][^"']*\binew\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<p\b[^>]*class=["'][^"']*\bimg\b[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ITEM_REGEX.exec(html)) !== null) {
    const itemHtml = match[1];
    const linkMatch = LINK_REGEX.exec(itemHtml);
    const titleMatch = TITLE_REGEX.exec(itemHtml);
    const dateMatch = DATE_REGEX.exec(stripHtml(itemHtml));
    if (!linkMatch || !titleMatch || !dateMatch) continue;

    const seq = linkMatch[2];
    const title = stripHtml(titleMatch[1]);
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: makeAbsoluteUrl(linkMatch[1]),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const viewHtml = VIEW_REGEX.exec(html)?.[1] ?? html;
  const title = stripHtml(
    DETAIL_TITLE_REGEX.exec(viewHtml)?.[1] ?? HTML_TITLE_REGEX.exec(html)?.[1] ?? "",
  );
  const body = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJindoAndInsert } = createPressCollector({
  cityName: "전남 진도군",
  region: "전남",
  ministry: "전남 진도군청",
  sourceOutlet: "전남 진도군청",
  sourceCode: "local-press-jindo",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
