// ============================================================
// 경기도 과천시청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /portal/newsList/list.do?mId=0301140100
// 목록: YH dynamic newsList table with fn_go_view(idx) onclick
// 상세: div.bod_view h4 + div.view_cont, attachment block before dl.view_file
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gccity.go.kr";
const MENU_ID = "0301140100";
const LIST_URL = `${BASE_URL}/portal/newsList/list.do?mId=${MENU_ID}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*onclick\s*=\s*["'][^"']*fn_go_view\(\s*(\d+)\s*\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;
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
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/섬네일 리스트 컨트롤로 돌아가기/g, " ")
    .replace(/이전보기|다음보기/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(idx: string): string {
  return `${BASE_URL}/portal/newsList/view.do?mId=${MENU_ID}&idx=${idx}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "gi");

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const dateMatch = DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const seq = linkMatch[1];
    const title = stripHtml(linkMatch[2]).replace(/\s*새글\s*$/, "").trim();
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const match = DETAIL_BODY_REGEX.exec(html);
  if (!match) return null;
  const text = stripHtml(match[1]);
  if (!/[가-힣]/.test(text) || text.length < 250) return null;
  return text.slice(0, 20000);
}

export const { scrapeAndInsert: scrapeGwacheonAndInsert } = createPressCollector({
  cityName: "과천시",
  region: "경기",
  ministry: "경기도 과천시청",
  sourceOutlet: "경기도 과천시청",
  sourceCode: "local-press-gwacheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
