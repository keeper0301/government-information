// ============================================================
// 전남 고흥군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /boardList.do?pageId=www102&boardId=BD_00025
// 목록: siiruBoard-gallery2 cards + boardView.do seq detail link
// 상세: bd_view_cont article body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.goheung.go.kr";
const PAGE_ID = "www102";
const BOARD_ID = "BD_00025";
const LIST_URL = `${BASE_URL}/boardList.do?pageId=${PAGE_ID}&boardId=${BOARD_ID}`;

const CARD_REGEX = /<li>\s*<div\b[\s\S]*?<\/li>/gi;
const DETAIL_LINK_REGEX =
  /<a\b[^>]*href=["']([^"']*\/boardView\.do\?[^"']*\bboardId=BD_00025[^"']*\bseq=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const IMG_ALT_REGEX = /<img\b[^>]*alt=["']([^"']{5,})["'][^>]*>/i;
const DATE_REGEX = /<span\b[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;
const TITLE_TAG_REGEX = /<title>\s*보도자료\s*-\s*([\s\S]*?)\s*\|\s*고흥군청\s*<\/title>/i;
const BODY_CONTAINER_REGEX = /<div\b[^>]*class=["'][^"']*\bbd_view_cont\b[^"']*["'][^>]*>/i;
const DETAIL_DATE_REGEX = /<small>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/small>|<span\b[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<div\b[^>]*class=["'][^"']*\bview_img\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\r\s*<br>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/dd>/gi, "\n")
      .replace(/<\/dt>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
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

function extractBalancedDiv(html: string, startRe: RegExp): string {
  const startMatch = startRe.exec(html);
  if (!startMatch) return "";
  const start = startMatch.index;
  const firstTagEnd = html.indexOf(">", start);
  if (firstTagEnd === -1) return "";
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    const isClosing = /^<\//.test(match[0]);
    depth += isClosing ? -1 : 1;
    if (depth === 0) {
      return html.slice(firstTagEnd + 1, match.index);
    }
  }
  return html.slice(firstTagEnd + 1);
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const cardRe = new RegExp(CARD_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = cardRe.exec(html)) !== null) {
    const cardHtml = match[0];
    const linkMatch = DETAIL_LINK_REGEX.exec(cardHtml);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(IMG_ALT_REGEX.exec(cardHtml)?.[1] ?? linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(cardHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({ seq, title, publishedDate, sourceUrl: makeAbsoluteUrl(href) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(
    META_TITLE_REGEX.exec(html)?.[1] ?? TITLE_TAG_REGEX.exec(html)?.[1] ?? "",
  );
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1] ?? dateMatch[4]}-${dateMatch[2] ?? dateMatch[5]}-${
        dateMatch[3] ?? dateMatch[6]
      }`
    : "";
  const body = stripHtml(extractBalancedDiv(html, BODY_CONTAINER_REGEX));
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGoheungAndInsert } = createPressCollector({
  cityName: "전남 고흥군",
  region: "전남",
  ministry: "전남 고흥군청",
  sourceOutlet: "전남 고흥군청",
  sourceCode: "local-press-goheung",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
