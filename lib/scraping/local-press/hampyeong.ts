// ============================================================
// 전남광주통합특별시 함평군청 보도/해명 수집 (2026-07-23)
// ============================================================
// 공식 보도/해명: /boardList.do?boardId=NEWS&pageId=www275
// 목록: div.board_list_body > div.body_row
// 상세: div.siiruBoardBody 안의 boardContents 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.hampyeong.go.kr";
const LIST_PATH = "/boardList.do?boardId=NEWS&pageId=www275";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bbody_row\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class\s*=\s*["'][^"']*\bbody_row\b|<\/div>\s*<div\b[^>]*id\s*=\s*["']boardPage["']|<\/div>\s*<\/div>\s*<script\b)/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*\bboardView\.do\?[^"']*\bseq=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bdate\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class\s*=\s*["'][^"']*\bblind\b[^"']*["'][^>]*>작성일<\/div>\s*([\d-]{10})/i;
const OG_TITLE_REGEX = /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i;
const TITLE_REGEX = /<strong\b[^>]*class\s*=\s*["'][^"']*\bsiiruBoardSubject\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i;
const BODY_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bboardContents\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class\s*=\s*["'][^"']*\bkoglSeView\b|<\/div>\s*<\/div>\s*<\/form>)/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<div\b[^>]*class\s*=\s*["'][^"']*\bimageView\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<div\b[^>]*class\s*=\s*["'][^"']*\bsiiruBoardFile\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
      .replace(/<span\b[^>]*class\s*=\s*["'][^"']*\bnew\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
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
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const dateMatch = DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const seq = linkMatch[2];
    const title = stripHtml(linkMatch[3]);
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: makeAbsoluteUrl(linkMatch[1]),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(
    TITLE_REGEX.exec(html)?.[1] ?? OG_TITLE_REGEX.exec(html)?.[1] ?? "",
  );
  const body = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeHampyeongAndInsert } = createPressCollector({
  cityName: "전남 함평군",
  region: "전남",
  ministry: "전남 함평군청",
  sourceOutlet: "전남 함평군청",
  sourceCode: "local-press-hampyeong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
