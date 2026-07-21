// ============================================================
// 충남 예산군청 보도/해명자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /bbs/BBSMSTR_000000000047/list.do
// 목록: bbs__list-card / item--bodo 카드, fn_search_detail('{nttId}')
// 상세: /bbs/BBSMSTR_000000000047/view.do?nttId={id}
// 본문: div.ui.bbs--view--cont[data-text-content="true"]
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yesan.go.kr";
const BOARD_ID = "BBSMSTR_000000000047";
const LIST_URL = `${BASE_URL}/bbs/${BOARD_ID}/list.do`;

const ITEM_REGEX = /<div\b[^>]*class=["'][^"']*\bitem--bodo\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bitem\b[^"']*\bitem--bodo\b[^"']*["'][^>]*>|<div\b[^>]*class=["'][^"']*\bp-pagination\b|<div\b[^>]*class=["'][^"']*\bprogram--paging\b|$)/gi;
const ID_REGEX = /fn_search_detail\(['"]([^'"]+)['"]\)/i;
const TITLE_REGEX = /<strong\b[^>]*class=["'][^"']*\bbbs__title\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i;
const LIST_DATE_REGEX = /<li\b[^>]*class=["'][^"']*\bregDate\b[^"']*["'][^>]*>[\s\S]*?(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_TITLE_REGEX = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
const DETAIL_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>[\s\S]*?등록일[\s\S]*?(\d{4})-(\d{2})-(\d{2})[\s\S]*?<\/span>/i;
const CONTENT_MARKER_REGEX = /<div\b(?=[^>]*\bdata-text-content=["']true["'])(?=[^>]*class=["'][^"']*\bbbs--view--cont\b[^"']*["'])[^>]*>/gi;

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
    .replace(/포토갤러리\s*(정지|재생)/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/bbs/${BOARD_ID}/view.do?nttId=${encodeURIComponent(seq)}`;
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
  const itemRe = new RegExp(ITEM_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(html)) !== null) {
    const itemHtml = match[1];
    const id = ID_REGEX.exec(itemHtml)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const title = stripHtml(TITLE_REGEX.exec(itemHtml)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(itemHtml);
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

export const { scrapeAndInsert: scrapeYesanAndInsert } = createPressCollector({
  cityName: "충남 예산군",
  region: "충남",
  ministry: "충남 예산군청",
  sourceOutlet: "충남 예산군청",
  sourceCode: "local-press-yesan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
