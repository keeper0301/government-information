// ============================================================
// 전북 정읍시청 보도자료방 수집 (2026-07-21) — 전북권 확장
// ============================================================
// 공식 보도자료: /board/list.jeongeup?boardId=BBS_0000019&menuCd=DOM_000000101002001000
// 목록: board/list.jeongeup table row + dataSid detail link
// 상세: /board/view.jeongeup?...&dataSid={id}
// 본문: table#bbs_table td.bbs_content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jeongeup.go.kr";
const BOARD_ID = "BBS_0000019";
const MENU_CD = "DOM_000000101002001000";
const LIST_URL = `${BASE_URL}/board/list.jeongeup?boardId=${BOARD_ID}&menuCd=${MENU_CD}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const DETAIL_LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/board\/view\.jeongeup\?[^"']*\bboardId=BBS_0000019[^"']*\bdataSid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const LIST_DATE_REGEX = /(\d{4})-(\d{2})-(\d{2})/;
const DETAIL_TITLE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*제목\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i;
const DETAIL_DATE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*작성일\s*<\/th>\s*<td\b[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/i;
const DETAIL_BODY_REGEX = /<td\b(?=[^>]*class=["'][^"']*\bbbs_content\b[^"']*["'])(?=[^>]*colspan=["']?2["']?)[^>]*>([\s\S]*?)<\/td>/i;

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
    boardId: BOARD_ID,
    menuCd: MENU_CD,
    paging: "ok",
    startPage: "1",
    dataSid: seq,
  });
  return `${BASE_URL}/board/view.jeongeup?${params.toString()}`;
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

export const { scrapeAndInsert: scrapeJeongeupAndInsert } = createPressCollector({
  cityName: "전북 정읍시",
  region: "전북",
  ministry: "전북 정읍시청",
  sourceOutlet: "전북 정읍시청",
  sourceCode: "local-press-jeongeup",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
