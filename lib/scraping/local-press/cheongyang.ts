// ============================================================
// 충남 청양군청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /cop/bbs/BBSMSTR_000000000064/selectBoardList.do
// 목록: div.bodo_list > div.item, selectBoardArticle.do?nttId={id}
// 상세: /cop/bbs/BBSMSTR_000000000064/selectBoardArticle.do?nttId={id}
// 본문: basic_table 상세 표의 board_images 다음 본문 td
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.cheongyang.go.kr";
const BOARD_ID = "BBSMSTR_000000000064";
const LIST_URL = `${BASE_URL}/cop/bbs/${BOARD_ID}/selectBoardList.do`;

const ITEM_REGEX = /<div\b[^>]*class=["']item["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["']item["']|<div\b[^>]*class=["']pagination|<div\b[^>]*class=["']paging|<form|$)/gi;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*BBSMSTR_000000000064\/selectBoardArticle\.do(?:;[^?"']*)?\?nttId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const SUBJECT_REGEX = /<strong\b[^>]*class=["']subject["'][^>]*>([\s\S]*?)<\/strong>/i;
const LIST_DATE_REGEX = /<span\b[^>]*class=["']date["'][^>]*>[\s\S]*?(\d{4})\.(\d{2})\.(\d{2})[\s\S]*?<\/span>/i;
const DETAIL_TITLE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*제목\s*<\/th>\s*<td\b[^>]*colspan=["']5["'][^>]*>([\s\S]*?)<\/td>/i;
const DETAIL_DATE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*등록일\s*<\/th>\s*<td[^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/td>/i;
const DETAIL_BODY_REGEX = /<tr\b[^>]*class=["']board_images["'][\s\S]*?<\/tr>\s*<tr>\s*<td\b[^>]*colspan=["']6["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["']codeView04["']|<\/td>\s*<\/tr>)/i;

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
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#40;/g, "(")
      .replace(/&#41;/g, ")")
      .replace(/&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/cop/bbs/${BOARD_ID}/selectBoardArticle.do?nttId=${seq}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(html)) !== null) {
    const itemHtml = match[1];
    const link = LINK_REGEX.exec(itemHtml);
    if (!link) continue;

    const seq = link[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(SUBJECT_REGEX.exec(itemHtml)?.[1] ?? link[3]);
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

  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  if (body.length < 250 || !/[가-힣]/.test(body)) return null;

  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeCheongyangAndInsert } =
  createPressCollector({
    cityName: "충남 청양군",
    region: "충남",
    ministry: "충남 청양군청",
    sourceOutlet: "충남 청양군청",
    sourceCode: "local-press-cheongyang",
    listUrl: LIST_URL,
    parseListItems: parseListPage,
    parseDetailBody,
  });
