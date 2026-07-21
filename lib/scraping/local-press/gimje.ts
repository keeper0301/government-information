// ============================================================
// 전북 김제시청 뉴스룸 수집 (2026-07-21) — 전북권 확장
// ============================================================
// 공식 뉴스룸: /board/list.gimje?boardId=BBS_0000046&menuCd=DOM_000000104005000000
// 목록: ul.news_list li + /board/view.gimje dataSid detail link
// 상세: div.bbs_view h4 + ul.col + div.bbs_con
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gimje.go.kr";
const BOARD_ID = "BBS_0000046";
const MENU_CD = "DOM_000000104005000000";
const LIST_URL = `${BASE_URL}/board/list.gimje?boardId=${BOARD_ID}&menuCd=${MENU_CD}`;

const ITEM_REGEX = /<li\b[^>]*>\s*<a\b[^>]*href=["']([^"']*\/board\/view\.gimje\?[^"']*\bboardId=BBS_0000046[^"']*\bdataSid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
const LIST_TITLE_REGEX = /<strong\b[^>]*>([\s\S]*?)<\/strong>/i;
const LIST_DATE_REGEX = /작성일\s*:\s*(\d{4})[.-]\s*(\d{2})[.-]\s*(\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_vtop\b[^"']*["'][^>]*>[\s\S]*?<h4\b[^>]*>([\s\S]*?)<\/h4>/i;
const DETAIL_DATE_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_vtop\b[^"']*["'][^>]*>[\s\S]*?<li>\s*(\d{4})[.-]\s*(\d{2})[.-]\s*(\d{2})\s*<\/li>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_con\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<p\b[^>]*class=["'][^"']*\bbbs_btn\b/i;

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

function makeDetailUrl(seq: string): string {
  const params = new URLSearchParams({
    boardId: BOARD_ID,
    menuCd: MENU_CD,
    paging: "ok",
    startPage: "1",
    dataSid: seq,
  });
  return `${BASE_URL}/board/view.gimje?${params.toString()}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(html)) !== null) {
    const itemHtml = match[3];
    const seq = match[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(LIST_TITLE_REGEX.exec(itemHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(itemHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1] ?? "";
  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGimjeAndInsert } = createPressCollector({
  cityName: "전북 김제시",
  region: "전북",
  ministry: "전북 김제시청",
  sourceOutlet: "전북 김제시청",
  sourceCode: "local-press-gimje",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
