// ============================================================
// 경기도 안성시청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료: /portal/saeol/newsList.do?mId=0502010100
// 목록: Saeol newsList table, boardView(page, newsEpctNo) onclick
// 상세: /portal/saeol/newsView.do?newsEpctNo=<id>&mId=0502010100
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.anseong.go.kr";
const LIST_PATH = "/portal/saeol/newsList.do?mId=0502010100";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;
const DETAIL_PATH = "/portal/saeol/newsView.do";
const MID = "0502010100";

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*onclick\s*=\s*["'][^"']*boardView\(\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]\s*\)[\s\S]*?<\/a>/i;
const ROW_DATE_REGEX = /<td\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>\s*<\/tr>\s*$/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bbod_view\b[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i;
const DETAIL_BODY_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)<dl\b[^>]*class\s*=\s*["'][^"']*\bview_file\b/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

function makeDetailUrl(newsEpctNo: string): string {
  return `${BASE_URL}${DETAIL_PATH}?newsEpctNo=${newsEpctNo}&mId=${MID}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(ROW_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const date = ROW_DATE_REGEX.exec(match[0])?.[1];
    if (!linkMatch || !date) continue;

    const [, , newsEpctNo] = linkMatch;
    const title = stripHtml(linkMatch[0]);
    if (seen.has(newsEpctNo) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(newsEpctNo);
    items.push({
      seq: newsEpctNo,
      title,
      publishedDate: date,
      sourceUrl: makeDetailUrl(newsEpctNo),
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

export const { scrapeAndInsert: scrapeAnseongAndInsert } = createPressCollector({
  cityName: "안성시",
  region: "경기",
  ministry: "경기도 안성시청",
  sourceOutlet: "경기도 안성시청",
  sourceCode: "local-press-anseong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
