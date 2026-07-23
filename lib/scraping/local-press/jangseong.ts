// ============================================================
// 전남 장성군청 보도자료 수집 (2026-07-23) — 전남권 확장
// ============================================================
// 공식 보도자료: /home/www/news/jangseong/bodo
// 목록: #board_list_table rows
// 상세: .show_info .con_detail 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jangseong.go.kr";
const LIST_PATH = "/home/www/news/jangseong/bodo";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr>\s*<td\b[^>]*class=["'][^"']*\blist_idx\b[^"']*["'][^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*class=["'][^"']*\blist_title\b[^"']*["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td\b[^>]*class=["'][^"']*\blist_reg_date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/home\/www\/news\/jangseong\/bodo\/show\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const SHOW_INFO_REGEX = /<div\b[^>]*class=["'][^"']*\bshow_info\b[^"']*["'][^>]*>([\s\S]*?)<div\b[^>]*class=["'][^"']*\bboard_button\b/i;
const DETAIL_REGEX = /<div\b[^>]*class=["'][^"']*\bcon_detail\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*>\s*<img\b[^>]*src=["']http:\/\/www\.kogl\.or\.kr|<div\b[^>]*class=["'][^"']*\bboard_button\b)/i;
const TITLE_REGEX = /<h3\b[^>]*class=["'][^"']*\btitle_en\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i;
const SUBTITLE_REGEX = /<h4\b[^>]*class=["'][^"']*\btitle_en2\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i;

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
      .replace(/<\/li>/gi, "\n")
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
    .replace(/새로운글/g, " ")
    .replace(/첨부파일[\s\S]*$/i, "")
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
  const showInfo = SHOW_INFO_REGEX.exec(html)?.[1] ?? html;
  const title = stripHtml(
    TITLE_REGEX.exec(showInfo)?.[1] ?? META_DESCRIPTION_REGEX.exec(html)?.[1] ?? "",
  );
  const subtitle = stripHtml(SUBTITLE_REGEX.exec(showInfo)?.[1] ?? "");
  const detail = stripHtml(DETAIL_REGEX.exec(html)?.[1] ?? "");
  const text = [title, subtitle, detail].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJangseongAndInsert } = createPressCollector({
  cityName: "전남 장성군",
  region: "전남",
  ministry: "전남 장성군청",
  sourceOutlet: "전남 장성군청",
  sourceCode: "local-press-jangseong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
