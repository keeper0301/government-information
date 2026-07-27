// ============================================================
// 대구 달성군 보도/해명 수집 (2026-07-27)
// ============================================================
// 공식 보도/해명: /index.do?menu_id=00000195
// 목록/상세: iCMS BBS_00071, fn_icms_navi_common('view', '<nttId>')
// 상세 본문: #bbsView dl.content pre visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.dalseong.daegu.kr";
const MENU_ID = "00000195";
const BBS_ID = "BBS_00071";
const BBS_TY_CODE = "BBST03";
const BBS_ATTRB_CODE = "BBSA03";
const LIST_URL = `${BASE_URL}/index.do?menu_id=${MENU_ID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r\n\u00a0]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).trim();
}

function normalizeDate(text: string): string | null {
  const m = /(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function makeDetailUrl(nttId: string): string {
  const params = new URLSearchParams({
    menu_id: MENU_ID,
    menu_link: "/icms/bbs/selectBoardArticle.do",
    bbsId: BBS_ID,
    nttId,
    bbsTyCode: BBS_TY_CODE,
    bbsAttrbCode: BBS_ATTRB_CODE,
  });
  return `${BASE_URL}/index.do?${params.toString()}`;
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*onclick=["'][^"']*fn_icms_navi_common\(\s*['"]view['"]\s*,\s*['"](\d+)['"][^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const seq = linkMatch[1];
    if (!seq || seen.has(seq)) continue;
    const title = stripTags(linkMatch[2]);
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const publishedDate = normalizeDate(cells.find((cell) => /20\d{2}[-./]\d{1,2}[-./]\d{1,2}/.test(cell)) ?? "");
    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeDetailUrl(seq) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const bodyMatch = /<dl\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>[\s\S]*?<dd\b[^>]*>([\s\S]*?)<\/dd>\s*<\/dl>/i.exec(html);
  const preMatch = bodyMatch ? /<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(bodyMatch[1]) : null;
  const bodyHtml = preMatch?.[1] ?? bodyMatch?.[1];
  if (!bodyHtml) return null;
  const body = stripTags(bodyHtml);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "대구 달성군",
  region: "대구",
  ministry: "대구 달성군청",
  sourceOutlet: "대구 달성군청",
  sourceCode: "local-press-dalseong-daegu",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeDalseongDaeguAndInsert = collector.scrapeAndInsert;
