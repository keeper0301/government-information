// ============================================================
// 경북 안동시 보도 자료 수집 (2026-07-27)
// ============================================================
// 공식 보도 자료: /portal/contents.do?mId=0403010000
// 정적 목록: /portal/bbs/list.do?ptIdx=104&mId=0403010000
// 목록: YH bod_list rows + req.post data-action bIdx
// 상세: bod_view > h4/view_info/view_cont visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.andong.go.kr";
const PT_IDX = "104";
const MID = "0403010000";
const LIST_URL = `${BASE_URL}/portal/bbs/list.do?ptIdx=${PT_IDX}&mId=${MID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*alt=["']새글["'][^>]*>/gi, " ")
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
  return `${BASE_URL}/portal/bbs/view.do?bIdx=${id}&ptIdx=${PT_IDX}&mId=${MID}`;
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

function tableRows(html: string): string[] {
  const table = /<table\b[^>]*class=["'][^"']*\bbod_list\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1] ?? html;
  return Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => match[1] ?? "");
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  for (const row of tableRows(html)) {
    const id = /data-action=["'][^"']*\/portal\/bbs\/view\.do\?bIdx=(\d+)&(?:amp;)?ptIdx=104[^"']*["']/i.exec(row)?.[1];
    if (!id || seen.has(id)) continue;

    const titleHtml = /<td\b[^>]*class=["'][^"']*\blist_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "";
    const title = stripTags(/<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(titleHtml)?.[1] ?? titleHtml)
      .replace(/새글/g, "")
      .trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateHtml = /<td\b[^>]*class=["'][^"']*\blist_date\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "";
    const date = normalizeDate(stripTags(dateHtml));

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
  cityName: "경북 안동시",
  region: "경북",
  ministry: "경북 안동시청",
  sourceOutlet: "경북 안동시청",
  sourceCode: "local-press-andong",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeAndongAndInsert = collector.scrapeAndInsert;
