// ============================================================
// 충북 단양군청 단양군핫이슈 수집 (2026-07-21) — 충북권 확장
// ============================================================
// 공식 단양군핫이슈: /dy21/984
// 목록: modules_board list action=read&action-value={hash}
// 상세: /dy21/984?action=read&action-value={hash}
// 본문: div.read_content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.danyang.go.kr";
const LIST_URL = `${BASE_URL}/dy21/984`;

const ACTION_VALUE_REGEX = /action=read(?:&amp;|&)action-value=([0-9a-f]{32})/i;
const LIST_LINK_REGEX = /<a\b[^>]*href=["']([^"']*action=read[^"']*action-value=[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const LIST_TITLE_REGEX = /<em[^>]*>([\s\S]*?)<\/em>/i;
const LIST_DATE_REGEX = /<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4})[.\-](\d{2})[.\-](\d{2})\s*<\/span>/i;
const DATE_REGEX = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bread_header\b[^"']*["'][^>]*>[\s\S]*?<h3[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h3>/i;
const DETAIL_DATE_REGEX = /<dt>\s*등록일자\s*<\/dt>\s*<dd>\s*(\d{4})[.\-](\d{2})[.\-](\d{2})\s*<\/dd>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bread_content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/?\s*(?:div|\s*)/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/dy21/984?action=read&action-value=${seq}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const linkRe = new RegExp(LIST_LINK_REGEX.source, "gi");
  while ((match = linkRe.exec(html)) !== null) {
    const href = decodeBasicEntities(match[1]);
    const seq = ACTION_VALUE_REGEX.exec(href)?.[1];
    if (!seq || seen.has(seq)) continue;

    const linkHtml = match[2];
    const title = stripHtml(LIST_TITLE_REGEX.exec(linkHtml)?.[1] ?? "")
      .replace(/\s*\.\.\.$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = LIST_DATE_REGEX.exec(linkHtml) ?? DATE_REGEX.exec(linkHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    seen.add(seq);
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

export const { scrapeAndInsert: scrapeDanyangAndInsert } = createPressCollector({
  cityName: "충북 단양군",
  region: "충북",
  ministry: "충북 단양군청",
  sourceOutlet: "충북 단양군청",
  sourceCode: "local-press-danyang",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
