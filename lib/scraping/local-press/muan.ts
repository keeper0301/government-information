// ============================================================
// 전남 무안군청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /www/openmuan/new/report
// 목록: table.board_t1 + idx detail link
// 상세: og:title / og:description body fallback
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.muan.go.kr";
const LIST_PATH = "/www/openmuan/new/report";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr>\s*<td>\d+<\/td>\s*<td\b[^>]*class\s*=\s*["'][^"']*\btitle_wrap\b[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*class\s*=\s*["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/www\/openmuan\/new\/report\?idx=(\d+)&amp;mode=view[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const TITLE_ATTR_REGEX = /title=["']([^"']+?)\s*에 대한 글내용 보기\.?["']/i;
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
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|새로운글/g, " ")
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
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = cleanTitle(
      TITLE_ATTR_REGEX.exec(rowHtml)?.[1] ?? linkMatch[3] ?? "",
    );
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: `${match[2]}-${match[3]}-${match[4]}`,
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

export const { scrapeAndInsert: scrapeMuanAndInsert } = createPressCollector({
  cityName: "전남 무안군",
  region: "전남",
  ministry: "전남 무안군청",
  sourceOutlet: "전남 무안군청",
  sourceCode: "local-press-muan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
