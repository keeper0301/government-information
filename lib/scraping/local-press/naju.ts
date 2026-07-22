// ============================================================
// 전남 나주시청 보도자료 수집 (2026-07-22) — 전남권 확장
// ============================================================
// 공식 보도자료: /www/administration/reporting/coverage
// 목록: table.table_list rows + idx detail link
// 상세: board_basic_view / view_title + view_box#con_ko body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.naju.go.kr";
const LIST_URL = `${BASE_URL}/www/administration/reporting/coverage`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LIST_LINK_REGEX = /<a\b[^>]*href=["']([^"']*\/www\/administration\/reporting\/coverage\?[^"']*\bidx=([^&"']+)[^"']*\bmode=view[^"']*)["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i;
const TD_REGEX = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const LIST_DATE_REGEX = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DETAIL_TITLE_REGEX = /<p\b[^>]*id=["']tit_ko["'][^>]*>([\s\S]*?)<\/p>/i;
const DETAIL_DATE_REGEX = /<span\b[^>]*class=["']tit["'][^>]*>\s*등록일\s*<\/span>\s*<span\b[^>]*class=["']sub["'][^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})/i;
const DETAIL_BODY_START_REGEX = /<div\b(?=[^>]*\bid=["']con_ko["'])(?=[^>]*\bclass=["'][^"']*\bview_box\b[^"']*["'])[^>]*>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
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
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

function extractBalancedDiv(html: string, startTagMatch: RegExpExecArray | null): string {
  if (!startTagMatch) return "";
  const openEnd = startTagMatch.index + startTagMatch[0].length;
  let depth = 1;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openEnd;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(openEnd, match.index);
  }

  return html.slice(openEnd);
}

function extractRowDate(rowHtml: string): string | null {
  const cells = [...rowHtml.matchAll(new RegExp(TD_REGEX.source, "gi"))].map(
    (match) => stripHtml(match[1]),
  );
  const dateCell = cells.find((cell) => LIST_DATE_REGEX.test(cell));
  const dateMatch = dateCell?.match(LIST_DATE_REGEX);
  return dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : null;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = LIST_LINK_REGEX.exec(rowHtml);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: extractRowDate(rowHtml),
      sourceUrl: makeAbsoluteUrl(href),
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
  const bodyHtml = extractBalancedDiv(html, DETAIL_BODY_START_REGEX.exec(html));
  const body = stripHtml(bodyHtml);
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeNajuAndInsert } = createPressCollector({
  cityName: "전남 나주시",
  region: "전남",
  ministry: "전남 나주시청",
  sourceOutlet: "전남 나주시청",
  sourceCode: "local-press-naju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
