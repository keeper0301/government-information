// ============================================================
// 부산 강서구 보도자료 수집 (2026-07-26)
// ============================================================
// 공식 보도자료: /portal/board/post/list.do?bcIdx=526&mid=0501050000
// 목록: y-CMSGovPortal 4.0 bod_list rows + data-req-get-p-idx
// 상세: /portal/board/post/view.do?bcIdx=526&mid=0501050000&idx=<id>
// 상세 view_cont에 전문이 노출되어 첨부(HWPX)는 fallback 없이 visible body 우선 사용.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.bsgangseo.go.kr";
const BC_IDX = "526";
const MENU_ID = "0501050000";
const LIST_URL = `${BASE_URL}/portal/board/post/list.do?bcIdx=${BC_IDX}&mid=${MENU_ID}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const IDX_REGEX = /data-req-get-p-idx=["'](\d+)["']/i;
const TITLE_REGEX = /<td\b[^>]*class=["'][^"']*\blist_tit\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i;
const DATE_REGEX = /<td\b[^>]*class=["'][^"']*\blist_date\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;
const VIEW_BODY_REGEX = /<div\b[^>]*class=["'][^"']*\bview_cont\b[^"']*["'][^>]*>([\s\S]*?)(?:<dl\b[^>]*class=["'][^"']*\bview_file\b|<\/div>\s*<\/div>\s*<div\b[^>]*class=["'][^"']*\bbod_foot\b)/i;

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
  const long = /(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/.exec(date);
  if (long) {
    const [, year, month, day] = long;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const short = /(\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/.exec(date);
  if (!short) return null;
  const [, year, month, day] = short;
  return `20${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function detailUrl(seq: string): string {
  return `${BASE_URL}/portal/board/post/view.do?bcIdx=${BC_IDX}&mid=${MENU_ID}&idx=${seq}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const row = match[1];
    const idx = IDX_REGEX.exec(row)?.[1];
    if (!idx || seen.has(idx)) continue;

    const title = stripTags(TITLE_REGEX.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const publishedDate = normalizeDate(stripTags(DATE_REGEX.exec(row)?.[1] ?? ""));

    seen.add(idx);
    items.push({
      seq: idx,
      title,
      publishedDate,
      sourceUrl: detailUrl(idx),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const body = stripTags(VIEW_BODY_REGEX.exec(html)?.[1] ?? "");
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "부산 강서구",
  region: "부산",
  ministry: "부산 강서구청",
  sourceOutlet: "부산 강서구청",
  sourceCode: "local-press-gangseo-busan",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeGangseoBusanAndInsert = collector.scrapeAndInsert;
