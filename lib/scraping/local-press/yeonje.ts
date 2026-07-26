// ============================================================
// 부산 연제구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /portal/bbs/list.do?ptIdx=12&mId=0206050000
// 목록: portal/bbs table rows + goTo.view('list','<bIdx>','12','0206050000')
// 상세: /portal/bbs/view.do?bIdx=<id>&ptIdx=12&mId=0206050000
// 상세 전문은 HWP 첨부(fn_egov_downFile) 쪽에 있어 attachment-first로 수집.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchEgovDownFileAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.yeonje.go.kr";
const PT_IDX = "12";
const MENU_ID = "0206050000";
const LIST_URL = `${BASE_URL}/portal/bbs/list.do?ptIdx=${PT_IDX}&mId=${MENU_ID}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const GO_TO_VIEW_REGEX = /goTo\.view\(\s*['"]list['"]\s*,\s*['"](\d+)['"]\s*,\s*['"]12['"]\s*,\s*['"]0206050000['"]\s*\)/i;
const TITLE_REGEX = /<td\b[^>]*class=["'][^"']*\blist_tit\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i;
const DATE_REGEX = /<td\b[^>]*class=["'][^"']*\blist_date\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;
const VIEW_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["'][^"']*\bbtn_wrap\b|<\/div>\s*<\/div>\s*<div\b[^>]*class=["'][^"']*\bbod_foot\b)/i;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n\s*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  ).replace(/\s+$/gm, "").trim();
}

function normalizeDate(date: string): string | null {
  const match = /(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function detailUrl(seq: string): string {
  return `${BASE_URL}/portal/bbs/view.do?bIdx=${seq}&ptIdx=${PT_IDX}&mId=${MENU_ID}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const row = match[1];
    const seq = GO_TO_VIEW_REGEX.exec(row)?.[1];
    if (!seq || seen.has(seq)) continue;

    const title = stripTags(TITLE_REGEX.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const publishedDate = normalizeDate(stripTags(DATE_REGEX.exec(row)?.[1] ?? ""));

    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: detailUrl(seq) });
  }

  return items;
}

function parseVisibleBody(html: string): string | null {
  const body = stripTags(VIEW_BODY_REGEX.exec(html)?.[1] ?? "");
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchEgovDownFileAttachBody(html, BASE_URL);
  if (attach) return attach;
  return parseVisibleBody(html);
}

const collector = createPressCollector({
  cityName: "부산 연제구",
  region: "부산",
  ministry: "부산 연제구청",
  sourceOutlet: "부산 연제구청",
  sourceCode: "local-press-yeonje",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeYeonjeAndInsert = collector.scrapeAndInsert;
