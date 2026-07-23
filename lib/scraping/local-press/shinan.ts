// ============================================================
// 전남광주통합특별시 신안군청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료/해명: /home/www/openinfo/participation_07/participation_07_03
// 목록: #board_list_table table rows
// 상세: show_form 인쇄/상세 HTML의 제목 + 내용 td.content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.shinan.go.kr";
const LIST_PATH = "/home/www/openinfo/participation_07/participation_07_03";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr>\s*<td\b[^>]*class=["'][^"']*\blist_idx\b[^"']*["'][^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*class=["'][^"']*\blist_title\b[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*class=["'][^"']*\blist_member_name\b[^"']*["'][^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*class=["'][^"']*\blist_reg_date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/show\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const TITLE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*<label>\s*제목\s*<\/label>\s*<\/th>\s*<td\b[^>]*colspan=["']3["'][^>]*>\s*<span>([\s\S]*?)<\/span>\s*<\/td>/i;
const CONTENT_REGEX = /<td\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<div\b[^>]*id=["']img_control["'][^>]*>[\s\S]*?<\/div>/gi, " ")
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

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const titleCellHtml = match[1];
    const publishedDate = match[2];
    const linkMatch = LINK_REGEX.exec(titleCellHtml);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const seq = linkMatch[2];
    const title = stripHtml(linkMatch[3]);
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(seq);
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
  const title = stripHtml(
    TITLE_REGEX.exec(html)?.[1] ?? META_DESCRIPTION_REGEX.exec(html)?.[1] ?? "",
  );
  const body = stripHtml(CONTENT_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeShinanAndInsert } = createPressCollector({
  cityName: "전남 신안군",
  region: "전남",
  ministry: "전남 신안군청",
  sourceOutlet: "전남 신안군청",
  sourceCode: "local-press-shinan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
