// ============================================================
// 경기도 포천시청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?bbsNo=5014&key=3731
// 목록: KRDS p-media list with selectBbsNttView href
// 상세: /www/selectBbsNttView.do?bbsNo=5014&nttNo=<id>&key=3731
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.pocheon.go.kr";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=5014&key=3731`;
const DETAIL_PATH = "/www/selectBbsNttView.do";
const BBS_NO = "5014";
const KEY = "3731";

const LIST_ITEM_REGEX = /<li\b[^>]*class\s*=\s*["'][^"']*\bp-media\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectBbsNttView\.do\?[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>[\s\S]*?<\/a>/i;
const TITLE_REGEX = /<em\b[^>]*class\s*=\s*["'][^"']*\bp-media__subject\b[^"']*["'][^>]*>([\s\S]*?)<\/em>/i;
const DATE_REGEX = /<em\b[^>]*class\s*=\s*["'][^"']*\bp-media__heading-date\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/em>/i;
const DETAIL_TITLE_REGEX = /<span\b[^>]*class\s*=\s*["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bcontenttext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div\b[^>]*class\s*=\s*["'][^"']*\bviewcontent\b/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class\s*=\s*["'][^"']*\bp-icon\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<div\b[^>]*class\s*=\s*["'][^"']*\bphoto_area\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(nttNo: string): string {
  return `${BASE_URL}${DETAIL_PATH}?bbsNo=${BBS_NO}&nttNo=${nttNo}&key=${KEY}&pageUnit=10&pageIndex=1`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(LIST_ITEM_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const itemHtml = match[1];
    const linkMatch = LINK_REGEX.exec(itemHtml);
    const date = DATE_REGEX.exec(itemHtml)?.[1];
    if (!linkMatch || !date) continue;

    const nttNo = linkMatch[2];
    const title = stripHtml(TITLE_REGEX.exec(itemHtml)?.[1] ?? linkMatch[0]);
    if (seen.has(nttNo) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(nttNo);
    items.push({
      seq: nttNo,
      title,
      publishedDate: date,
      sourceUrl: makeDetailUrl(nttNo),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapePocheonAndInsert } = createPressCollector({
  cityName: "포천시",
  region: "경기",
  ministry: "경기도 포천시청",
  sourceOutlet: "경기도 포천시청",
  sourceCode: "local-press-pocheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
