// ============================================================
// 충북 진천군청 보도자료 수집 (2026-07-22) — 충북권 완성
// ============================================================
// 공식 보도자료: /home/sub.do?menukey=247&mode=list
// 목록: board_gallery 테이블 row + mode=view&no={id}
// 상세: board_view table substance 셀, 전문은 HWP 첨부(board/download.do)에 있는 경우가 많음
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.jincheon.go.kr";
const LIST_URL = `${BASE_URL}/home/sub.do?menukey=247&mode=list`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /href=["'][^"']*\bmode=view\b[^"']*\bno=(\d+)[^"']*["']/i;
const TITLE_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_title\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<div\b[^>]*class=["'][^"']*\bboard_date\b[^"']*["'][^>]*>\s*(\d{4})-(\d{2})-(\d{2})\s*<\/div>/i;
const DETAIL_TITLE_REGEX = /<th\b[^>]*class=["'][^"']*\bview_title\b[^"']*["'][^>]*>([\s\S]*?)<\/th>/i;
const DETAIL_DATE_REGEX = /<th\b[^>]*>\s*등록일\s*<\/th>\s*<td\b[^>]*>\s*(\d{4})-(\d{2})-(\d{2})/i;
const SUBSTANCE_REGEX = /<td\b[^>]*class=["'][^"']*\bsubstance\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;

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
      .replace(/<\/td>/gi, "\n")
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
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(seq: string): string {
  return `${BASE_URL}/home/sub.do?menukey=247&mode=view&no=${encodeURIComponent(seq)}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = new RegExp(ROW_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const row = match[1];
    const id = LINK_REGEX.exec(row)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const title = stripHtml(TITLE_REGEX.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateMatch = DATE_REGEX.exec(row);
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

function parseStaticDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const datePrefix = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const body = stripHtml(SUBSTANCE_REGEX.exec(html)?.[1] ?? "");
  const text = [title, datePrefix, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, `${BASE_URL}/home/`);
  if (attach) return attach;
  return parseStaticDetailBody(html);
}

export const { scrapeAndInsert: scrapeJincheonAndInsert } = createPressCollector({
  cityName: "충북 진천군",
  region: "충북",
  ministry: "충북 진천군청",
  sourceOutlet: "충북 진천군청",
  sourceCode: "local-press-jincheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
