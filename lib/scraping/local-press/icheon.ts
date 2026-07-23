// ============================================================
// 경기도 이천시청 보도자료 수집 (2026-07-23)
// ============================================================
// 공식 보도자료: /news/contents.do?mid=0301000000
// 목록: YH board/post photo list with data-req-get-p-idx
// 상세: /news/board/post/view.do?bcIdx=785&mid=0301000000&idx=<id>
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.icheon.go.kr";
const LIST_PATH = "/news/contents.do?mid=0301000000";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;
const DETAIL_PATH = "/news/board/post/view.do";
const BOARD_IDX = "785";
const MID = "0301000000";

const LIST_LINK_REGEX = /<a\b[^>]*data-req-get-p-idx\s*=\s*["'](\d+)["'][\s\S]*?<\/a>/gi;
const TITLE_REGEX = /<span\b[^>]*class\s*=\s*["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const LIST_DATE_REGEX = /<span\b[^>]*class\s*=\s*["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})(?:\([^)]*\))?\s*<\/span>/i;
const DETAIL_TITLE_REGEX = /<div\b[^>]*class\s*=\s*["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
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

function makeDetailUrl(idx: string): string {
  return `${BASE_URL}${DETAIL_PATH}?bcIdx=${BOARD_IDX}&mid=${MID}&idx=${idx}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(LIST_LINK_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const seq = match[1];
    if (seen.has(seq)) continue;

    const cardHtml = match[0];
    const title = stripHtml(TITLE_REGEX.exec(cardHtml)?.[1] ?? "");
    const date = LIST_DATE_REGEX.exec(cardHtml)?.[1];
    if (!title || !date || title.length < 5 || !/[가-힣]/.test(title)) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: date,
      sourceUrl: makeDetailUrl(seq),
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

export const { scrapeAndInsert: scrapeIcheonAndInsert } = createPressCollector({
  cityName: "이천시",
  region: "경기",
  ministry: "경기도 이천시청",
  sourceOutlet: "경기도 이천시청",
  sourceCode: "local-press-icheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
