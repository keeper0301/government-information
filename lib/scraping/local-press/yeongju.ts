// ============================================================
// 경북 영주시 보도자료 수집 (2026-07-28)
// ============================================================
// 공식 보도자료: /open_content/main/page.do?mnu_uid=1524
// 목록: tbl_list rows, detail parm_bod_uid
// 상세: news_view > data_top/data_contents; body appears in document.write(...)
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yeongju.go.kr";
const MNU_UID = "1524";
const LIST_URL = `${BASE_URL}/open_content/main/page.do?mnu_uid=${MNU_UID}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
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
  return `${BASE_URL}/open_content/main/page.do?pageNo=1&pagePrvNxt=1&pageRef=0&pageOrder=0&step=258&parm_bod_uid=${id}&srchVoteType=-1&srchEnable=-1&srchBgpUid=-1&srchKeyword=&srchSDate=1990-01-01&srchColumn=&srchEDate=2100-01-01&mnu_uid=${MNU_UID}&`;
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

function decodeScriptHtml(jsString: string): string {
  return jsString
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ");
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  const list = extractBlockByClass(html, "div", "board_list") ?? html;
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(list)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*href=["']([^"']*parm_bod_uid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const id = linkMatch[2];
    if (seen.has(id)) continue;

    const title = stripTags(linkMatch[3]).replace(/\.\.\.\s*$/g, "").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const date = normalizeDate(stripTags(/<td\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? title));

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
  const detail = extractBlockByClass(html, "div", "news_view");
  if (!detail) return null;

  const title = stripTags(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(detail)?.[1] ?? "");
  const meta = stripTags(extractBlockByClass(detail, "div", "data_top") ?? "");
  const contentArea = extractBlockByClass(detail, "div", "data_contents") ?? "";
  const scriptBodies = [...contentArea.matchAll(/document\.write\('([\s\S]*?)'\);/g)]
    .map((match) => stripTags(decodeScriptHtml(match[1])))
    .filter(Boolean);
  const visible = stripTags(contentArea);
  const content = [visible, ...scriptBodies].filter(Boolean).join("\n");
  const body = [title, meta, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "경북 영주시",
  region: "경북",
  ministry: "경북 영주시청",
  sourceOutlet: "경북 영주시청",
  sourceCode: "local-press-yeongju",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeYeongjuAndInsert = collector.scrapeAndInsert;
