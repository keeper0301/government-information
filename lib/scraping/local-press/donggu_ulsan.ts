// ============================================================
// 울산 동구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /cop/bbs/selectBoardList.do?bbsId=BBSMSTR_000000000322
// 목록: eGov bbs_list rows + nttId detail link
// 상세: bbs_detail_basic > bbs_detail_tit/bbs_detail_content visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.donggu.ulsan.kr";
const BBS_ID = "BBSMSTR_000000000322";
const LIST_URL = `${BASE_URL}/cop/bbs/selectBoardList.do?bbsId=${BBS_ID}`;

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

function detailUrl(nttId: string): string {
  return `${BASE_URL}/cop/bbs/selectBoardArticle.do?bbsId=${BBS_ID}&nttId=${nttId}`;
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
  const rowRe = /<tr\b[^>]*class=["'][^"']*\bnoticeList\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const linkMatch = /<a\b[^>]*href=["']([^"']*selectBoardArticle\.do[^"']*\bbbsId=BBSMSTR_000000000322[^"']*\bnttId=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!linkMatch) continue;
    const nttId = linkMatch[2];
    if (!nttId || seen.has(nttId)) continue;

    const subjectMatch = /<td\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row);
    const title = stripTags(subjectMatch?.[1] ?? linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const date = stripTags(/<td\b[^>]*class=["'][^"']*\bregDate\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(row)?.[1] ?? "");

    seen.add(nttId);
    items.push({
      seq: nttId,
      title,
      publishedDate: normalizeDate(date),
      sourceUrl: detailUrl(nttId),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const detail = extractDivByClass(html, "bbs_detail_basic");
  if (!detail) return null;

  const title = stripTags(/<div\b[^>]*class=["'][^"']*\bbbs_detail_tit\b[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(detail)?.[1] ?? "");
  const meta = stripTags(/<div\b[^>]*class=["'][^"']*\bbbs_detail_tit\b[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>\s*<!--\s*첨부파일|<div\b[^>]*class=["'][^"']*\bbbs_detail_content\b)/i.exec(detail)?.[1] ?? "");
  const contentHtml = extractDivByClass(detail, "bbs_detail_content")?.replace(/<!--\[data-hwpjson\][\s\S]*$/i, "") ?? "";
  const content = stripTags(contentHtml);
  const body = [title, meta, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "울산 동구",
  region: "울산",
  ministry: "울산 동구청",
  sourceOutlet: "울산 동구청",
  sourceCode: "local-press-donggu-ulsan",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeDongguUlsanAndInsert = collector.scrapeAndInsert;
