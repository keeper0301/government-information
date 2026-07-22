// ============================================================
// 전남 영암군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /home/www/open_information/yeongam_news/bodo/yeongam.go
// 목록: dl.board_photonews + /bodo/show/{slug}
// 상세: div.show_info / div.con_detail
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yeongam.go.kr";
const LIST_PATH = "/home/www/open_information/yeongam_news/bodo/yeongam.go";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ITEM_REGEX = /<dl\b[^>]*class=["'][^"']*\bboard_photonews\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/home\/www\/open_information\/yeongam_news\/bodo\/show\/([^"'/?#&]+)[^"']*)["'][^>]*>/i;
const TITLE_REGEX = /<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["']show_info["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i;
const DETAIL_DATE_REGEX = /<div\b[^>]*class=["']reg_info["'][^>]*>\s*(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["']con_detail["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div\b[^>]*class=['"]codeView04/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/gi;

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
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|새로운글/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(raw: string): string {
  return stripHtml(raw).replace(/\s+이미지\s*\d+$/i, "").trim();
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
    const itemHtml = match[1];
    const linkMatch = LINK_REGEX.exec(itemHtml);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = cleanTitle(TITLE_REGEX.exec(itemHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(itemHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeAbsoluteUrl(href) });
  }

  return items;
}

function fallbackTitle(html: string): string {
  let candidate = "";
  let match: RegExpExecArray | null;
  const re = new RegExp(META_DESCRIPTION_REGEX.source, "gi");
  while ((match = re.exec(html)) !== null) {
    const text = cleanTitle(match[1] ?? "");
    if (text && text !== "영암군 홈페이지") candidate = text;
  }
  return candidate;
}

export function parseDetailBody(html: string): string | null {
  const title = cleanTitle(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? fallbackTitle(html));
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  const text = [title, date, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeYeongamAndInsert } = createPressCollector({
  cityName: "전남 영암군",
  region: "전남",
  ministry: "전남 영암군청",
  sourceOutlet: "전남 영암군청",
  sourceCode: "local-press-yeongam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
