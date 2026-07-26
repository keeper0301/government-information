// ============================================================
// 부산 사하구 보도자료 수집 (2026-07-26)
// ============================================================
// 공식 보도자료: /portal/bbs/list.do?ptIdx=24&mId=0301060000
// 목록: tableSt_list rows + boardView(... bIdx, ptIdx=24, mId=0301060000 ...)
// 상세: /portal/bbs/view.do?mId=0301060000&bIdx=<id>&ptIdx=24
// 보도자료 전문은 PDF 첨부(fn_egov_downFile) 쪽에 있고 visible cont_box는 제목 수준으로 얇다.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchEgovDownFileAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.saha.go.kr";
const PT_IDX = "24";
const MENU_ID = "0301060000";
const LIST_URL = `${BASE_URL}/portal/bbs/list.do?ptIdx=${PT_IDX}&mId=${MENU_ID}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const BOARD_VIEW_REGEX = /boardView\(\s*['"]listForm['"]\s*,\s*['"][^'"]+['"]\s*,\s*['"]Y['"]\s*,\s*['"](\d+)['"]\s*,\s*['"]24['"]\s*,\s*['"]0301060000['"]\s*,\s*['"]\d+['"]\s*\)/i;
const TITLE_REGEX = /<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>/i;
const DATE_REGEX = /<td\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeDate(date: string): string | null {
  const match = /(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const row = match[1];
    const idMatch = BOARD_VIEW_REGEX.exec(row);
    if (!idMatch) continue;
    const seq = idMatch[1];
    if (seen.has(seq)) continue;

    const title = stripTags(TITLE_REGEX.exec(row)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    const publishedDate = normalizeDate(stripTags(DATE_REGEX.exec(row)?.[1] ?? ""));

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: `${BASE_URL}/portal/bbs/view.do?mId=${MENU_ID}&bIdx=${seq}&ptIdx=${PT_IDX}`,
    });
  }

  return items;
}

function parseVisibleBody(html: string): string | null {
  const match = /<div\b[^>]*class=["'][^"']*\bcont_box\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
    html,
  );
  const body = stripTags(match?.[1] ?? "");
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchEgovDownFileAttachBody(html, BASE_URL);
  if (attach) return attach;
  return parseVisibleBody(html);
}

const collector = createPressCollector({
  cityName: "부산 사하구",
  region: "부산",
  ministry: "부산 사하구청",
  sourceOutlet: "부산 사하구청",
  sourceCode: "local-press-saha",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeSahaAndInsert = collector.scrapeAndInsert;
