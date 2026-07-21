// ============================================================
// 충남 태안군청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /cop/bbs/BBSMSTR_000000000040/selectBoardList.do
// 목록: basic_table 목록, fn_egov_inqire_notice(..., '{nttId}', 'BBSMSTR_000000000040')
// 상세: /cop/bbs/BBSMSTR_000000000040/selectBoardArticle.do?nttId={id}
// 본문: div.left.bbs-view-content.bbs-view-content-skin07
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.taean.go.kr";
const BOARD_ID = "BBSMSTR_000000000040";
const LIST_URL = `${BASE_URL}/cop/bbs/${BOARD_ID}/selectBoardList.do`;

const ITEM_REGEX = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>|<div\b[^>]*class=["'][^"']*\bpagination\b|$)/gi;
const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const ID_REGEX = /fn_egov_inqire_notice\([^,]+,\s*['"]([^'"]+)['"],\s*['"]BBSMSTR_000000000040['"]\)|name=["']nttId["'][^>]*value=["']([^"']+)["']|nttId=([^&"']+)/i;
const TITLE_LINK_REGEX = /<a\b[^>]*(?:onclick|href)=["'][^"']*(?:fn_egov_inqire_notice|selectBoardArticle)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
const LIST_DATE_REGEX = /(\d{4})[.-](\d{2})[.-](\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs_detail_tit\b[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<li\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>[\s\S]*?등록일\s*:\s*(\d{4})-(\d{2})-(\d{2})[\s\S]*?<\/li>/i;
const CONTENT_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bbbs-view-content\b[^"']*["'][^>]*>/gi;

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
      .replace(/<\/li>/gi, "\n")
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
    .replace(/공보팀\s*이\(가\) 창작한[\s\S]*?이용할 수 있습니다\.?/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/cop/bbs/${BOARD_ID}/selectBoardArticle.do?nttId=${encodeURIComponent(seq)}`;
}

function extractBalancedDivs(html: string, marker: RegExp): string[] {
  const blocks: string[] = [];
  marker.lastIndex = 0;

  while (marker.exec(html) !== null) {
    let depth = 1;
    const cursor = marker.lastIndex;
    const token = /<\/div\s*>|<div\b[^>]*>/gi;
    token.lastIndex = cursor;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = token.exec(html)) !== null) {
      if (tokenMatch[0].startsWith("</")) depth -= 1;
      else depth += 1;
      if (depth === 0) {
        blocks.push(html.slice(cursor, tokenMatch.index));
        marker.lastIndex = token.lastIndex;
        break;
      }
    }
  }

  return blocks;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const blocks = [
    ...[...html.matchAll(new RegExp(ITEM_REGEX.source, "gi"))].map(
      (match) => match[1],
    ),
    ...[...html.matchAll(new RegExp(ROW_REGEX.source, "gi"))].map(
      (match) => match[1],
    ),
  ];

  for (const rowHtml of blocks) {
    const idMatch = ID_REGEX.exec(rowHtml);
    const id = idMatch?.[1] ?? idMatch?.[2] ?? idMatch?.[3];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const title = stripHtml(TITLE_LINK_REGEX.exec(rowHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(rowHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq: id,
      title,
      publishedDate,
      sourceUrl: makeDetailUrl(id),
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

  const blocks = extractBalancedDivs(
    html,
    new RegExp(CONTENT_MARKER_REGEX.source, "gi"),
  )
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeTaeanAndInsert } = createPressCollector({
  cityName: "충남 태안군",
  region: "충남",
  ministry: "충남 태안군청",
  sourceOutlet: "충남 태안군청",
  sourceCode: "local-press-taean",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
