// ============================================================
// 충남 서천군청 보도자료 수집 (2026-07-21) — 충남권 확장
// ============================================================
// 공식 보도자료: /bbs/BBSMSTR_000000000270/list.do
// 목록: data-ntt-id={B...} 카드형 보도자료
// 상세: /bbs/BBSMSTR_000000000270/view.do?nttId={id}
// 본문: div.div_speller_content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.seocheon.go.kr";
const BOARD_ID = "BBSMSTR_000000000270";
const LIST_PATH = `/bbs/${BOARD_ID}/list.do`;
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ITEM_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*\bitem--bodo\b[^"']*["'][^>]*>/gi;
const ID_REGEX = /data-ntt-id=["']([^"']+)["']/i;
const TITLE_REGEX = /<strong\b[^>]*class=["'][^"']*\bbbs__title\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i;
const LIST_DATE_REGEX = /(\d{4})[.-]\s*(\d{2})[.-]\s*(\d{2})/;
const DETAIL_TITLE_REGEX = /<h2\b[^>]*class=["'][^"']*\bboard-view__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i;
const DETAIL_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\binfo__date\b[^"']*["'][^>]*>\s*<i\b[^>]*>등록일<\/i>\s*(\d{4})-(\d{2})-(\d{2})/i;
const DETAIL_BODY_MARKER_REGEX = /<div\b[^>]*class=["'][^"']*\bdiv_speller_content\b[^"']*["'][^>]*>/gi;

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
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\r/g, "\n"),
  )
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
  const marker = new RegExp(ITEM_MARKER_REGEX.source, "gi");
  const starts: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = marker.exec(html)) !== null) starts.push(match.index);

  for (let index = 0; index < starts.length; index += 1) {
    const block = html.slice(starts[index], starts[index + 1] ?? html.length);
    const seq = decodeBasicEntities(ID_REGEX.exec(block)?.[1] ?? "").trim();
    if (!seq || seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(TITLE_REGEX.exec(block)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const text = stripHtml(block);
    const dateMatch = LIST_DATE_REGEX.exec(text);
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

  const blocks = extractBalancedDivs(
    html,
    new RegExp(DETAIL_BODY_MARKER_REGEX.source, "gi"),
  )
    .map(stripHtml)
    .filter((text) => text.length >= 250 && /[가-힣]/.test(text));

  if (blocks.length === 0) return null;
  const body = blocks.sort((a, b) => b.length - a.length)[0];
  return [title, datePrefix, body].filter(Boolean).join("\n").slice(0, 20000).trim();
}

export const { scrapeAndInsert: scrapeSeocheonAndInsert } = createPressCollector({
  cityName: "충남 서천군",
  region: "충남",
  ministry: "충남 서천군청",
  sourceOutlet: "충남 서천군청",
  sourceCode: "local-press-seocheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
