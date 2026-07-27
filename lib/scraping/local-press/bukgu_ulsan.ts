// ============================================================
// 울산 북구 보도자료 수집 (2026-07-27)
// ============================================================
// 공식 보도자료: /mrmt/pageCont.do?menuNo=1020000
// 실제 목록/상세: /mrmt/cop/bbs/selectBoardList.do?bbsId=BBSMSTR_000000000002
// 목록: 구정홍보관 news_list_box cards + fn_egov_inqire_notice(nttId, bbsId)
// 상세: board_news_view > real_tit/w_date/txt_in visible body
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.bukgu.ulsan.kr";
const BBS_ID = "BBSMSTR_000000000002";
const MENU_NO = "1020000";
const LIST_URL = `${BASE_URL}/mrmt/pageCont.do?menuNo=${MENU_NO}`;

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--\[data-hwpjson\][\s\S]*?-->/gi, " ")
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

function detailUrl(nttId: string): string {
  return `${BASE_URL}/mrmt/cop/bbs/selectBoardArticle.do?nttId=${nttId}&bbsId=${BBS_ID}&menuNo=${MENU_NO}`;
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

function itemSlices(html: string): string[] {
  const listStart = html.search(/<ul\b[^>]*class=["'][^"']*\bnews_list_box\b[^"']*["'][^>]*>/i);
  if (listStart < 0) return [];
  const listEnd = html.search(/<div\b[^>]*class=["'][^"']*\bpaging_field\b/i);
  const listHtml = html.slice(listStart, listEnd > listStart ? listEnd : undefined);
  const starts = [...listHtml.matchAll(/<input\b[^>]*name=["']arrNttId\[\]["'][^>]*value=["']\d+["'][^>]*>/gi)].map((m) => m.index ?? 0);
  return starts.map((start, index) => listHtml.slice(start, starts[index + 1] ?? listHtml.length));
}

export function parseListItems(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  for (const slice of itemSlices(html)) {
    const idMatch = /fn_egov_inqire_notice\(['"](\d+)['"]\s*,\s*['"]BBSMSTR_000000000002['"]\)/i.exec(slice);
    const nttId = idMatch?.[1];
    if (!nttId || seen.has(nttId)) continue;

    const title = stripTags(/<div\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(slice)?.[1] ?? "").replace(/\s*&nbsp;\s*$/i, "").trim();
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    const dateText = stripTags(/<li\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i.exec(slice)?.[1] ?? "");

    seen.add(nttId);
    items.push({
      seq: nttId,
      title,
      publishedDate: normalizeDate(dateText),
      sourceUrl: detailUrl(nttId),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const detail = extractDivByClass(html, "board_news_view") ?? extractDivByClass(html, "board_normal_view");
  if (!detail) return null;

  const title = stripTags(/<span\b[^>]*class=["'][^"']*\breal_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(detail)?.[1] ?? "");
  const date = stripTags(/<dl\b[^>]*class=["'][^"']*\bw_date\b[^"']*["'][^>]*>[\s\S]*?<dd\b[^>]*>([\s\S]*?)<\/dd>/i.exec(detail)?.[1] ?? "");
  const contentHtml = extractDivByClass(detail, "txt_in")?.replace(/<!--\[data-hwpjson\][\s\S]*$/i, "") ?? "";
  const content = stripTags(contentHtml);
  const body = [title, date, content].filter(Boolean).join("\n");

  return /[가-힣]/.test(body) && body.length >= 250 ? body.slice(0, 20000) : null;
}

const collector = createPressCollector({
  cityName: "울산 북구",
  region: "울산",
  ministry: "울산 북구청",
  sourceOutlet: "울산 북구청",
  sourceCode: "local-press-bukgu-ulsan",
  listUrl: LIST_URL,
  parseListItems,
  parseDetailBody,
});

export const scrapeBukguUlsanAndInsert = collector.scrapeAndInsert;
