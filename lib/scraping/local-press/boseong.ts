// ============================================================
// 전남 보성군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /www/open_administration/city_news/press_release
// 목록: photonews_top / photonews_cont cards + idx detail link
// 상세: photo_view article body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.boseong.go.kr";
const LIST_PATH = "/www/open_administration/city_news/press_release";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const DETAIL_LINK_REGEX =
  /<a\b[^>]*href=["']([^"']*\/www\/open_administration\/city_news\/press_release\?idx=(\d+)&amp;mode=view[^"']*)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>/gi;
const DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;
const TITLE_TAG_REGEX = /<title>\s*([^<]+?)\s*&lt;\s*보도자료/i;
const DETAIL_DATE_REGEX = /작성일\s*(\d{4})\.(\d{2})\.(\d{2})|제\s*공\s*일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/i;
const DETAIL_BODY_CONTAINER_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_cont\b[^"']*["'][^>]*>/i;

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
    .replace(/\bNEW\b|새로운글/g, " ")
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
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return html.slice(firstTagEnd + 1, match.index);
  }
  return html.slice(firstTagEnd + 1);
}

function cleanTitle(raw: string): string {
  return stripHtml(raw)
    .replace(/^\d{4}-\d{2}-\d{2}\s*/, "")
    .replace(/\s*에 대한 글내용 보기\.?\s*$/, "")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(DETAIL_LINK_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    const title = cleanTitle(match[3] ?? match[4] ?? "");
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    const matchIndex = match.index;
    const matchEnd = match.index + match[0].length;
    const itemStart = Math.max(
      html.lastIndexOf("<li", matchIndex),
      html.lastIndexOf('<div class="photonews_cont"', matchIndex),
    );
    const itemEnd = Math.min(
      ...["</li>", "</div>"].map((tag) => {
        const idx = html.indexOf(tag, matchEnd);
        return idx === -1 ? Number.POSITIVE_INFINITY : idx + tag.length;
      }),
    );
    const itemHtml = html.slice(
      itemStart === -1 ? matchIndex : itemStart,
      Number.isFinite(itemEnd) ? itemEnd : matchEnd + 1000,
    );
    const dateMatch = DATE_REGEX.exec(itemHtml) ?? DATE_REGEX.exec(match[4] ?? "");
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
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
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1] ?? dateMatch[4]}-${dateMatch[2] ?? dateMatch[5]?.padStart(2, "0")}-${
        dateMatch[3] ?? dateMatch[6]?.padStart(2, "0")
      }`
    : "";
  let body = stripHtml(extractBalancedDiv(html, DETAIL_BODY_CONTAINER_REGEX));
  body = body
    .replace(/\s*목록\s+본 저작물은[\s\S]*$/i, "")
    .replace(/\s*담당자\s+기획예산실[\s\S]*$/i, "")
    .trim();
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeBoseongAndInsert } = createPressCollector({
  cityName: "전남 보성군",
  region: "전남",
  ministry: "전남 보성군청",
  sourceOutlet: "전남 보성군청",
  sourceCode: "local-press-boseong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
