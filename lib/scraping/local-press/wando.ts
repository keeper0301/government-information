// ============================================================
// 전남 완도군청 보도자료 수집 (2026-07-23) — 전남권 확장
// ============================================================
// 공식 보도자료: /wando/sub.cs?m=299
// 목록: photonews_top + tbl_type 카드
// 상세: #board_basic_view .news_tit + .board_cont 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.wando.go.kr";
const LIST_PATH = "/wando/sub.cs?m=299";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;
const BOARD_ID = "BBSMSTR_000000000036";

const TOP_ITEM_REGEX = /<li>\s*<div\b[^>]*class=["'][^"']*\bphotonews_oppacity\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\bnttId=(\d+)[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<span>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>[\s\S]*?<\/li>/gi;
const CARD_TITLE_REGEX = /<dt\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/dt>/gi;
const CARD_LINK_REGEX = /<a\b[^>]*href=["']([^"']*\bnttId=(\d+)[^"']*)["'][^>]*title=["']([^"']*?)\s*에 대한 글보기["'][^>]*>/i;
const CARD_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\bspan_date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/i;
const VIEW_REGEX = /<div\b[^>]*id=["']board_basic_view["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*\bboard_button_list\b/i;
const TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bnews_tit\b[^"']*["'][^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i;
const BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--\s*\/\/data_cont/i;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;

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

function addItem(
  items: PressNewsItem[],
  seen: Set<string>,
  href: string,
  seq: string,
  rawTitle: string,
  publishedDate: string,
): void {
  const title = stripHtml(rawTitle);
  if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) return;
  seen.add(seq);
  items.push({
    seq,
    title,
    publishedDate,
    sourceUrl: makeAbsoluteUrl(href.includes(BOARD_ID) ? href : `${href}&pBoardId=${BOARD_ID}`),
  });
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = TOP_ITEM_REGEX.exec(html)) !== null) {
    addItem(items, seen, match[1], match[2], match[3], match[4]);
  }

  while ((match = CARD_TITLE_REGEX.exec(html)) !== null) {
    const cardHtml = match[1];
    const linkMatch = CARD_LINK_REGEX.exec(cardHtml);
    const dateMatch = CARD_DATE_REGEX.exec(cardHtml);
    if (!linkMatch || !dateMatch) continue;
    addItem(items, seen, linkMatch[1], linkMatch[2], linkMatch[3], dateMatch[1]);
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const viewHtml = VIEW_REGEX.exec(html)?.[1] ?? html;
  const title = stripHtml(
    TITLE_REGEX.exec(viewHtml)?.[1] ?? META_TITLE_REGEX.exec(html)?.[1] ?? "",
  );
  const body = stripHtml(BODY_REGEX.exec(viewHtml)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeWandoAndInsert } = createPressCollector({
  cityName: "전남 완도군",
  region: "전남",
  ministry: "전남 완도군청",
  sourceOutlet: "전남 완도군청",
  sourceCode: "local-press-wando",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
