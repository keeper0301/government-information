// ============================================================
// 전남광주통합특별시 해남군청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료: /planweb/board/list.9is?boardUid=18e3368f5fb80fdc015fdc4c2ac203e7
// 목록: div.press_list > div.item
// 상세: div.view_box 안의 h4 제목 + div.data_cont 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.haenam.go.kr";
const LIST_PATH =
  "/planweb/board/list.9is?boardUid=18e3368f5fb80fdc015fdc4c2ac203e7&contentUid=&layoutUid=&pBoardId=BBSMSTR_000000000131&recordCountPerPage=10";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ITEM_REGEX = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--\s*\/\/item\s*-->/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\bnttId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /작성일\s*(\d{4}-\d{2}-\d{2})/i;
const VIEW_BOX_REGEX = /<div\b[^>]*class=["'][^"']*\bview_box\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["'][^"']*\bbtnarea\b|<\/body>)/i;
const DETAIL_TITLE_REGEX = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i;
const BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bdata_cont\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--\s*\/\/data_cont\s*-->/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class=["'][^"']*\bnew2\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<div\b[^>]*class=["'][^"']*\bfilelist\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
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

  while ((match = ITEM_REGEX.exec(html)) !== null) {
    const itemHtml = match[1];
    const linkMatch = LINK_REGEX.exec(itemHtml);
    const dateMatch = DATE_REGEX.exec(stripHtml(itemHtml));
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
  const viewHtml = VIEW_BOX_REGEX.exec(html)?.[1] ?? html;
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(viewHtml)?.[1] ?? "");
  const body = stripHtml(BODY_REGEX.exec(viewHtml)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeHaenamAndInsert } = createPressCollector({
  cityName: "전남 해남군",
  region: "전남",
  ministry: "전남 해남군청",
  sourceOutlet: "전남 해남군청",
  sourceCode: "local-press-haenam",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
