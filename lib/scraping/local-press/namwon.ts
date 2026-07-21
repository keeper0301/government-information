// ============================================================
// 전북 남원시청 보도자료 수집 (2026-07-21) — 전북권 확장
// ============================================================
// 공식 보도자료: /index.do?menuUid=ff8080818e3beff0018e407936b40088
// 실제 목록: /board/post/list.do?boardUid=ff8080818ea1fec5018ea24651660037&menuUid=ff8080818e3beff0018e407936b40088
// 목록: table row + /board/post/view.do postUid detail link
// 상세: table.view_table td.view_con
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.namwon.go.kr";
const BOARD_UID = "ff8080818ea1fec5018ea24651660037";
const MENU_UID = "ff8080818e3beff0018e407936b40088";
const LIST_URL = `${BASE_URL}/board/post/list.do?boardUid=${BOARD_UID}&menuUid=${MENU_UID}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const DETAIL_LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/board\/post\/view\.do\?[^"']*\bboardUid=ff8080818ea1fec5018ea24651660037[^"']*\bpostUid=([^&"']+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const LIST_DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<strong\b[^>]*>([\s\S]*?)<\/strong>\s*<\/td>/i;
const DETAIL_DATE_REGEX = /<strong>\s*등록일\s*:\s*<\/strong>\s*<span>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/span>/i;
const DETAIL_BODY_REGEX = /<td\b(?=[^>]*class=["'][^"']*\bview_con\b[^"']*["'])(?=[^>]*colspan=["']?4["']?)[^>]*>([\s\S]*?)<\/td>/i;

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
      .replace(/<\/td>/gi, "\n")
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
    .replace(/\b새글\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  const params = new URLSearchParams({
    boardUid: BOARD_UID,
    menuUid: MENU_UID,
    postUid: seq,
  });
  return `${BASE_URL}/board/post/view.do?${params.toString()}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const row = match[1];
    const linkMatch = DETAIL_LINK_REGEX.exec(row);
    if (!linkMatch) continue;

    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(row);
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
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1];
  if (!bodyHtml) return null;

  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeNamwonAndInsert } = createPressCollector({
  cityName: "전북 남원시",
  region: "전북",
  ministry: "전북 남원시청",
  sourceOutlet: "전북 남원시청",
  sourceCode: "local-press-namwon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
