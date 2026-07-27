// ============================================================
// 울산 울주군 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /ulju/contents.do?mId=0404020000
// 정적 목록: /ulju/bbs/list.do?ptIdx=146&mId=0404020000
// 목록: YH bod_list rows + goTo.view('list','<bIdx>','146','0404020000')
// 상세: bod_view > h4/view_info/view_cont visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.ulju.ulsan.kr";
const PT_IDX = "146";
const MID = "0404020000";
const LIST_URL = `${BASE_URL}/ulju/bbs/list.do?ptIdx=${PT_IDX}&mId=${MID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\f\v\u00a0]+/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\n\s*/g, "\n")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const match = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function detailUrl(bIdx: string): string {
  return `${BASE_URL}/ulju/bbs/view.do?ptIdx=${PT_IDX}&mId=${MID}&bIdx=${bIdx}`;
}

function extractDivByClass(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = openMatch.index;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openMatch.index + openMatch[0].length, match.index);
    } else {
      depth += 1;
    }
  }
  return html.slice(openMatch.index + openMatch[0].length);
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const viewMatch = /goTo\.view\(['"]list['"]\s*,\s*['"](\d+)['"]\s*,\s*['"]146['"]\s*,\s*['"]0404020000['"]\)/i.exec(row);
    const bIdx = viewMatch?.[1];
    if (!bIdx || seen.has(bIdx)) continue;

    const linkMatch = /<a\b[^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/i.exec(row);
    const title = stripTags(linkMatch?.[1] ?? /<td\b[^>]*class=["'][^"']*\blist_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateText = stripTags(/<td\b[^>]*class=["'][^"']*\blist_date\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "");

    seen.add(bIdx);
    items.push({
      seq: bIdx,
      title,
      publishedDate: normalizeDate(dateText),
      sourceUrl: detailUrl(bIdx),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const detail = extractDivByClass(html, "bod_view");
  if (!detail) return null;

  const title = stripTags(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(detail)?.[1] ?? "");
  const date = stripTags(/<li\b[^>]*class=["'][^"']*\bview_date\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i.exec(detail)?.[1] ?? "");
  const contentHtml = extractDivByClass(detail, "view_cont") ?? "";
  const content = stripTags(contentHtml);
  const body = [title, date, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "울산 울주군",
  region: "울산",
  ministry: "울산 울주군청",
  sourceOutlet: "울산 울주군청",
  sourceCode: "local-press-ulju-ulsan",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeUljuUlsanAndInsert = collector.scrapeAndInsert;
