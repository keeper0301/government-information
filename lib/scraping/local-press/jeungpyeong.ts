// ============================================================
// 충북 증평군청 보도자료 수집 (2026-07-21) — 충북권 확장
// ============================================================
// 공식 미디어증평 > 보도자료: /kor/cop/bbs/BBSMSTR_000000000135/selectBoardList.do
// 목록: div.bodo_list > div.item, form action selectBoardArticle.do?nttId={id}
// 상세: /kor/cop/bbs/BBSMSTR_000000000135/selectBoardArticle.do?nttId={id}
// 본문: div.bbs_detail_cont div.bbs-view-content-skin07
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.jp.go.kr";
const BBS_ID = "BBSMSTR_000000000135";
const LIST_URL = `${BASE_URL}/kor/cop/bbs/${BBS_ID}/selectBoardList.do`;

const ITEM_REGEX = /<div class="item">([\s\S]*?)(?=<div class="item">|<div class="board_pager"|<div class="paginate"|$)/g;
const ACTION_REGEX = /action="([^"]*selectBoardArticle\.do\?nttId=([^&"]+)[^"]*)"/i;
const INPUT_VALUE_REGEX = /<input\b[^>]*type="submit"[^>]*value="([^"]+)"/gi;
const DATE_REGEX = /<span class="date">\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/span>/i;
const DETAIL_TITLE_REGEX = /<div class="bbs_detail_tit">[\s\S]*?<h2>\s*([\s\S]*?)\s*<\/h2>/i;
const DETAIL_BODY_REGEX = /<div class="left bbs-view-content bbs-view-content-skin07">([\s\S]*?)<\/div>\s*<\/div>/i;

function decodeHtmlAttribute(value: string): string {
  return decodeBasicEntities(value)
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/&#39;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const item = match[1];
    const action = ACTION_REGEX.exec(item);
    if (!action) continue;

    const seq = action[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const values = [...item.matchAll(INPUT_VALUE_REGEX)].map((m) =>
      decodeHtmlAttribute(m[1] ?? ""),
    );
    const title = values.find((value) => value.length >= 5 && /[가-힣]/.test(value));
    if (!title) continue;

    const dateMatch = DATE_REGEX.exec(item);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/kor/cop/bbs/${BBS_ID}/selectBoardArticle.do?nttId=${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  if (!body || body.length < 250 || !/[가-힣]/.test(body)) return null;

  const normalized = title && !body.startsWith(title) ? `${title}\n\n${body}` : body;
  return normalized.slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeJeungpyeongAndInsert } =
  createPressCollector({
    cityName: "충북 증평군",
    region: "충북",
    ministry: "충북 증평군청",
    sourceOutlet: "충북 증평군청",
    sourceCode: "local-press-jeungpyeong",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
