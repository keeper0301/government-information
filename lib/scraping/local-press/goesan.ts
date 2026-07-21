// ============================================================
// 충북 괴산군청 오늘의 괴산 수집 (2026-07-21) — 충북권 확장
// ============================================================
// 공식 오늘의 괴산: /www/selectBbsNttList.do?bbsNo=213&key=136
// 목록: web_zine형 selectBbsNttView.do?...bbsNo=213&nttNo={id}
// 상세: /www/selectBbsNttView.do?key=136&bbsNo=213&nttNo={id}
// 본문: table.table_view td.con
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.goesan.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=213&key=136`;

const ITEM_REGEX = /<li>\s*([\s\S]*?)\s*<\/li>/g;
const LINK_REGEX = /selectBbsNttView\.do\?[^"']*?bbsNo=213[^"']*?nttNo=(\d+)[^"']*?["']/i;
const TITLE_REGEX = /<dt>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/dt>/i;
const DATE_REGEX = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;
const DETAIL_BODY_REGEX = /<td\b(?=[^>]*\bclass=["'][^"']*\bcon\b[^"']*["'])[^>]*>([\s\S]*?)<\/td>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const itemRe = new RegExp(ITEM_REGEX.source, "g");
  while ((match = itemRe.exec(html)) !== null) {
    const itemHtml = match[1];
    if (!itemHtml.includes("selectBbsNttView.do")) continue;

    const link = LINK_REGEX.exec(itemHtml);
    if (!link) continue;

    const seq = link[1];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(TITLE_REGEX.exec(itemHtml)?.[1] ?? "")
      .replace(/\s*\.\.\.$/, "")
      .replace(/\s*새글\s*$/, "")
      .replace(/\s*\bNEW\s*$/, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(itemHtml);
    const publishedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/www/selectBbsNttView.do?key=136&bbsNo=213&nttNo=${seq}`,
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const bodyHtml = DETAIL_BODY_REGEX.exec(html)?.[1];
  if (!bodyHtml) return null;

  const text = stripHtml(bodyHtml);
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGoesanAndInsert } = createPressCollector({
  cityName: "충북 괴산군",
  region: "충북",
  ministry: "충북 괴산군청",
  sourceOutlet: "충북 괴산군청",
  sourceCode: "local-press-goesan",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
