// ============================================================
// 경북 김천시 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: https://www.gc.go.kr/portal/bbs/list.do?ptIdx=1944&mId=1203060000
// 목록: YH bod_blog card list, onclick goTo.view('list','<bIdx>','1944','1203060000','')
// 상세: /portal/bbs/view.do?bIdx=<id>&ptIdx=1944&mId=1203060000
// 본문: div.bod_view > h4/view_info/view_cont; visible text is sufficient.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.gc.go.kr";
const PT_IDX = "1944";
const MENU_ID = "1203060000";
const LIST_URL = `${BASE_URL}/portal/bbs/list.do?ptIdx=${PT_IDX}&mId=${MENU_ID}`;

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

function detailUrl(id: string): string {
  return `${BASE_URL}/portal/bbs/view.do?bIdx=${id}&ptIdx=${PT_IDX}&mId=${MENU_ID}`;
}

function extractBlockByClass(html: string, tag: string, className: string): string | null {
  const openRe = new RegExp(
    `<${tag}\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
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
  const list = extractBlockByClass(html, "div", "bod_blog") ?? html;
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const itemRe = /<a\b[^>]*onclick=["'][^"']*goTo\.view\('list','(\d+)','1944','1203060000',''\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(list)) !== null) {
    const id = match[1];
    if (!id || seen.has(id)) continue;

    const slice = match[2] ?? "";
    const title = stripTags(/<span\b[^>]*class=["'][^"']*\btit\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(slice)?.[1] ?? "");
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const meta = stripTags(/<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(slice)?.[1] ?? "");
    const date = normalizeDate(meta);
    seen.add(id);
    items.push({
      seq: id,
      title,
      publishedDate: date,
      sourceUrl: detailUrl(id),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const detail = extractBlockByClass(html, "div", "bod_view");
  if (!detail) return null;

  const title = stripTags(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(detail)?.[1] ?? "");
  const meta = stripTags(extractBlockByClass(detail, "div", "view_info") ?? "");
  const content = stripTags(extractBlockByClass(detail, "div", "view_cont") ?? "");
  const body = [title, meta, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "경북 김천시",
  region: "경북",
  ministry: "경북 김천시청",
  sourceOutlet: "경북 김천시청",
  sourceCode: "local-press-gimcheon",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeGimcheonAndInsert = collector.scrapeAndInsert;
