// ============================================================
// 전남 강진군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /www/government/news/press
// 목록: md_list card + idx detail link
// 상세: og:title / og:description body fallback
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gangjin.go.kr";
const LIST_PATH = "/www/government/news/press";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ITEM_REGEX = /<li>\s*<a\b[^>]*href=["']([^"']*\/www\/government\/news\/press\?idx=(\d+)&amp;mode=view[^"']*)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
const TITLE_REGEX = /<p\b[^>]*class=["'][^"']*\bc_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/p>|title=["']([^"']+?)\s*에 대한 글내용 보기\.?["']/i;
const DATE_REGEX = /<li>\s*(?:<span\b[^>]*>[\s\S]*?<\/span>\s*)?(\d{4})-(\d{2})-(\d{2})\s*<\/li>|보도자료 등록\s*<span>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']\s*\/>/i;
const TITLE_TAG_REGEX = /<title>\s*([\s\S]*?)\s*&lt;\s*보도자료/i;

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
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|\b새글\b|\bN\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(raw: string): string {
  return stripHtml(raw)
    .replace(/\s*에 대한 글내용 보기\.?\s*$/, "")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    const itemHtml = match[0];
    if (seen.has(seq)) continue;

    const titleMatch = TITLE_REGEX.exec(itemHtml);
    const title = cleanTitle(titleMatch?.[1] ?? titleMatch?.[2] ?? match[3] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(itemHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1] ?? dateMatch[4]}-${dateMatch[2] ?? dateMatch[5]}-${dateMatch[3] ?? dateMatch[6]}`
      : null;

    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeAbsoluteUrl(href) });
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

export const { scrapeAndInsert: scrapeGangjinAndInsert } = createPressCollector({
  cityName: "전남 강진군",
  region: "전남",
  ministry: "전남 강진군청",
  sourceOutlet: "전남 강진군청",
  sourceCode: "local-press-gangjin",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
