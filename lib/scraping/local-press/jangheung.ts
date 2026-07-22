// ============================================================
// 전남 장흥군청 장흥소식 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 장흥소식: /www/organization/news/jh_news
// 목록: div.card_list > div.card
// 상세: og:title / og:description body fallback
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jangheung.go.kr";
const LIST_PATH = "/www/organization/news/jh_news";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const CARD_REGEX = /<div\b[^>]*class=["'][^"']*\bcard\b[^"']*["'][^>]*>\s*<div\b[^>]*class=["'][^"']*\bcard_body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bcard_foot\b/i;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/www\/organization\/news\/jh_news\?idx=(\d+)&amp;mode=view[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/i;
const TITLE_SPAN_REGEX = /<span\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/i;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']\s*\/>/i;
const TITLE_TAG_REGEX = /<title>\s*([\s\S]*?)\s*&lt;\s*장흥소식/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/dd>/gi, "\n")
      .replace(/<\/dt>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&amp;quot;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|새로운글/g, " ")
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(raw: string): string {
  return stripHtml(raw).trim();
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
    const cardHtml = match[1];
    const linkMatch = LINK_REGEX.exec(cardHtml);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = cleanTitle(linkMatch[3] ?? TITLE_SPAN_REGEX.exec(cardHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(cardHtml);
    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : null,
      sourceUrl: makeAbsoluteUrl(href),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = cleanTitle(
    META_TITLE_REGEX.exec(html)?.[1] ?? TITLE_TAG_REGEX.exec(html)?.[1] ?? "",
  );
  const description = stripHtml(META_DESCRIPTION_REGEX.exec(html)?.[1] ?? "");
  const text = [title, description].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJangheungAndInsert } = createPressCollector({
  cityName: "전남 장흥군",
  region: "전남",
  ministry: "전남 장흥군청",
  sourceOutlet: "전남 장흥군청",
  sourceCode: "local-press-jangheung",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
