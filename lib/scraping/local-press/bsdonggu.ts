// ============================================================
// 부산 동구 보도/해명자료 수집 (2026-07-25)
// ============================================================
// 공식 보도/해명자료: /board/list.donggu?boardId=BBS_0000025&menuCd=DOM_000000103001006000
// 목록/상세: RFC3 board/list.donggu + board/view.donggu, dataSid detail id
// 상세 visible body는 제목 수준으로 얇고 전문은 HWP 첨부(board/download.donggu)에 있음.
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.bsdonggu.go.kr";
const BOARD_ID = "BBS_0000025";
const MENU_CD = "DOM_000000103001006000";
const LIST_URL = `${BASE_URL}/board/list.donggu?boardId=${BOARD_ID}&menuCd=${MENU_CD}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LIST_LINK_REGEX = /<td\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/board\/view\.donggu[^"']*\bboardId=BBS_0000025[^"']*\bdataSid=([^&"']+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const ROW_DATE_REGEX = /<td\b[^>]*class=["'][^"']*\bmobile_need\b[^"']*["'][^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<tr\b[^>]*class=["'][^"']*\bsubject\b[^"']*["'][^>]*>[\s\S]*?<td\b[^>]*colspan=["']?5["']?[^>]*>([\s\S]*?)<\/td>/i;
const DETAIL_DATE_REGEX = /<th\b[^>]*scope=["']row["'][^>]*>\s*등록일\s*<\/th>\s*<td[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/td>/i;
const DETAIL_BODY_REGEX = /<tr\b[^>]*class=["'][^"']*\bbbs_content_area\b[^"']*["'][^>]*>[\s\S]*?<td\b[^>]*class=["'][^"']*\bbbs_content\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;

function stripHtml(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/td>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeAbsoluteUrl(href: string): string {
  return new URL(href.replace(/&amp;/g, "&"), LIST_URL).toString();
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = ROW_REGEX.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const linkMatch = LIST_LINK_REGEX.exec(rowHtml);
    const dateMatch = ROW_DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const seq = linkMatch[2];
    if (seen.has(seq)) continue;
    seen.add(seq);

    const title = stripHtml(linkMatch[3]);
    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;

    items.push({
      seq,
      title,
      publishedDate: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      sourceUrl: makeAbsoluteUrl(linkMatch[1]),
    });
  }

  return items;
}

function parseVisibleBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const dateMatch = DETAIL_DATE_REGEX.exec(html);
  const visible = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const datePrefix = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : "";
  const text = [title, datePrefix, visible].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchSiAttachBody(html, BASE_URL);
  return attach ?? parseVisibleBody(html);
}

export const { scrapeAndInsert: scrapeBsdongguAndInsert } = createPressCollector({
  cityName: "부산 동구",
  region: "부산",
  ministry: "부산 동구청",
  sourceOutlet: "부산 동구청",
  sourceCode: "local-press-bsdonggu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
