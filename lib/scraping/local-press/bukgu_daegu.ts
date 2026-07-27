// ============================================================
// 대구 북구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /index.do?menu_id=00000201
// 목록/상세: iCMS BBSMSTR_000000001178, fn_icms_navi_common('view', '<nttId>')
// 상세 본문: table.bbsView.bbsNoticeView td.bbsViewBody #bbs_cn
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.buk.daegu.kr";
const MENU_ID = "00000201";
const BBS_ID = "BBSMSTR_000000001178";
const BBS_TY_CODE = "BBST01";
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

function titleFromAttachment(row: string): string | null {
  const altMatch = /<img\b[^>]*alt=(["'])([\s\S]*?)\1/i.exec(row);
  if (!altMatch) return null;
  const alt = stripTags(altMatch[2])
    .replace(/\s*\[[^\]]*byte\]\s*$/i, "")
    .replace(/\.(?:jpe?g|png|gif|hwp|hwpx|pdf)$/i, "")
    .replace(/^\d+(?:-\d+)?\.\s*/, "")
    .replace(/^[^-]+-/, "")
    .trim();
  return alt.length >= 8 && /[가-힣]/.test(alt) ? alt : null;
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
    const rawTitle = stripTags(linkMatch[2]);
    const attachTitle = titleFromAttachment(row);
    const title = rawTitle.includes("...") && attachTitle ? attachTitle : rawTitle;
    if (!title || title.length < 3 || !/[가-힣]/.test(title)) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const publishedDate = normalizeDate(cells.find((cell) => /20\d{2}[-./]\d{1,2}[-./]\d{1,2}/.test(cell)) ?? "");
    seen.add(seq);
    items.push({ seq, title, publishedDate, sourceUrl: makeDetailUrl(seq) });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const cnMatch = /<div\b[^>]*id=["']bbs_cn["'][^>]*>([\s\S]*?)<div\b[^>]*id=["']hwpEditorBoardContent["']/i.exec(html);
  const bodyHtml = cnMatch?.[1] ?? /<td\b[^>]*class=["'][^"']*\bbbsViewBody\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1];
  if (!bodyHtml) return null;
  const body = stripTags(bodyHtml);
  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "대구 북구",
  region: "대구",
  ministry: "대구 북구청",
  sourceOutlet: "대구 북구청",
  sourceCode: "local-press-bukgu-daegu",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeBukguDaeguAndInsert = collector.scrapeAndInsert;
