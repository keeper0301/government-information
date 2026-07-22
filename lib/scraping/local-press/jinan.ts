// ============================================================
// 전북 진안군청 보도자료 수집 (2026-07-21) — 전북권 확장
// ============================================================
// 공식 보도자료: /board/list.jinan?menuCd=DOM_000000107002002000&boardId=BBS_0000034
// 목록: div.bbsList li + /board/view.jinan dataSid detail link
// 상세: div.basicView titleField + div.conText
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jinan.go.kr";
const BOARD_ID = "BBS_0000034";
const MENU_CD = "DOM_000000107002002000";
const LIST_URL = `${BASE_URL}/board/list.jinan?menuCd=${MENU_CD}&boardId=${BOARD_ID}`;

const ROW_REGEX = /<li>\s*<a\b[^>]*href=["']([^"']*\/board\/view\.jinan\?[^"']*\bboardId=BBS_0000034[^"']*\bdataSid=(\d+)[^"']*)["'][^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<\/a>[\s\S]*?<em\b[^>]*class=["'][^"']*\binfo\b[^"']*["'][^>]*>([\s\S]*?)<\/em>\s*<\/li>/gi;
const LIST_DATE_REGEX = /등록일자\s*:\s*(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\btitleField\b[^"']*["'][^>]*>[\s\S]*?<h4\b[^>]*>([\s\S]*?)<\/h4>/i;
const DETAIL_DATE_REGEX = /등록일자\s*:\s*(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bconText\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;

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
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#039;/g, "'")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/\r/g, "\n"),
  )
    .replace(/\bNEW\b|\b새글\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&").replace(/&&/g, "&"), BASE_URL)
    .toString()
    .replace(/&&/g, "&");
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const href = match[1];
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(match[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(stripHtml(match[4]));
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

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
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(stripHtml(html));
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1] ?? "";
  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeJinanAndInsert } = createPressCollector({
  cityName: "전북 진안군",
  region: "전북",
  ministry: "전북 진안군청",
  sourceOutlet: "전북 진안군청",
  sourceCode: "local-press-jinan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
