// ============================================================
// 전남 영광군청 보도자료 수집 (2026-07-23) — 전남권 확장
// ============================================================
// 공식 보도자료: /bbs/?b_id=news_data&site=headquarter_new&mn=9056
// 목록: #board_list table rows
// 상세: #board_view .board_view_contents 본문 우선, og fallback
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yeonggwang.go.kr";
const LIST_PATH = "/bbs/?b_id=news_data&site=headquarter_new&mn=9056";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr>\s*<td\b[^>]*class=["'][^"']*\bt_num\b[^"']*["'][^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*class=["'][^"']*\bt_title\b[^"']*["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td\b[^>]*class=["'][^"']*\bt_date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\btype=view\b[^"']*\bbs_idx=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_view_contents\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/td>/i;
const META_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i;
const META_DESCRIPTION_REGEX = /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']\s*>/i;
const VIEW_TITLE_REGEX = /<th\b[^>]*>\s*제목\s*<\/th>\s*<td\b[^>]*colspan=["']3["'][^>]*>([\s\S]*?)<\/td>/i;

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
    .replace(/첨부파일\s*다운로드[\s\S]*$/i, "")
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
    VIEW_TITLE_REGEX.exec(html)?.[1] ?? META_TITLE_REGEX.exec(html)?.[1] ?? "",
  );
  const body = stripHtml(
    BODY_REGEX.exec(html)?.[1] ?? META_DESCRIPTION_REGEX.exec(html)?.[1] ?? "",
  );
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeYeonggwangAndInsert } = createPressCollector({
  cityName: "전남 영광군",
  region: "전남",
  ministry: "전남 영광군청",
  sourceOutlet: "전남 영광군청",
  sourceCode: "local-press-yeonggwang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
