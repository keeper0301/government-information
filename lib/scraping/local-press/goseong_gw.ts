// ============================================================
// 강원특별자치도 고성군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /prog/bbsArticle/BBSMSTR_000000003771/list.do
// 목록: board_list table + fn_search_detail('<nttId>')
// 상세: /prog/bbsArticle/BBSMSTR_000000003771/view.do?nttId=<id>
// 본문: div.ui.bbs--view--content (visible body complete)

import { decodeHtmlEntities } from "@/lib/utils";
import { createPressCollector, type PressNewsItem } from "./_factory";

const BASE_URL = "https://www.gwgs.go.kr";
const LIST_PATH = "/prog/bbsArticle/BBSMSTR_000000003771/list.do";
const DETAIL_PATH = "/prog/bbsArticle/BBSMSTR_000000003771/view.do";
const LIST_URL = `${BASE_URL}${LIST_PATH}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const DETAIL_CALL_REGEX = /fn_search_detail\(\s*['"]([^'"]+)['"]/i;
const TITLE_LINK_REGEX = /<td\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bsubject\b)[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i;
const DATE_CELL_REGEX = /<td\b[^>]*data-cell-header\s*=\s*["']등록일["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const TITLE_REGEX = /<h2\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bbbs--view--tit\b)[^>]*>([\s\S]*?)<\/h2>/i;
const DATE_REGEX = /<span\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bdate\b)[^>]*>[\s\S]*?<i>\s*등록일\s*<\/i>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/i;
const BODY_REGEX = /<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bbbs--view--content\b)[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i;

function cleanText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*\bir-bbs-new\b[^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function detailUrl(seq: string): string {
  const url = new URL(DETAIL_PATH, BASE_URL);
  url.searchParams.set("nttId", seq);
  return url.toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = ROW_REGEX.exec(html)) !== null) {
    const row = match[1];
    const idMatch = DETAIL_CALL_REGEX.exec(row);
    const titleMatch = TITLE_LINK_REGEX.exec(row);
    const dateMatch = DATE_CELL_REGEX.exec(row);
    if (!idMatch || !titleMatch || !dateMatch) continue;

    const seq = idMatch[1].trim();
    if (!seq || seen.has(seq)) continue;
    const title = cleanText(titleMatch[1]);
    if (!title) continue;
    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: detailUrl(seq),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = cleanText(TITLE_REGEX.exec(html)?.[1] ?? "");
  const date = DATE_REGEX.exec(html)?.[1] ?? null;
  const bodyHtml = BODY_REGEX.exec(html)?.[1] ?? "";
  const body = cleanText(bodyHtml)
    .replace(/공공저작물 자유이용 허락 표시[\s\S]*$/i, "")
    .trim();
  const chunks = [title, date ? `등록일 ${date}` : null, body].filter(Boolean) as string[];
  const result = chunks.join("\n\n").replace(/\s+\n/g, "\n").trim();
  return /[가-힣]/.test(result) && result.length >= 250 ? result.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "고성군",
  region: "강원",
  ministry: "강원특별자치도 고성군청",
  sourceOutlet: "강원특별자치도 고성군청",
  sourceCode: "local-press-goseong-gw",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});

export const scrapeGoseongGwAndInsert = collector.scrapeAndInsert;
