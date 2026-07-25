// ============================================================
// 강원특별자치도 양구군청 보도자료 수집 (2026-07-25)
// ============================================================
// 공식 보도자료: /user_sub?gfnc=www&mu_idx=232
// 목록: FNC user_board_list table, bcd=press + bk detail id
// 상세: user_board_read_title/read_information/user_board_read_view
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";

const BASE_URL = "https://www.yanggu.go.kr";
const LIST_URL = `${BASE_URL}/user_sub?gfnc=www&mu_idx=232`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const LINK_REGEX = /<a\b[^>]*href=["']([^"']*\bbk=([A-Z0-9]+)[^"']*\bbcd=press[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*\bclass\s*=\s*["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const TITLE_REGEX = /<div\b[^>]*\bid=["']user_board_read_title["'][^>]*>([\s\S]*?)<\/div>/i;
const DETAIL_DATE_REGEX = /작성일\s*:\s*(\d{4}-\d{2}-\d{2})/;
const BODY_REGEX = /<div\b[^>]*\bid=["']user_board_read_view["'][^>]*>([\s\S]*?)(?:<div\b[^>]*\bid=["']user_board_read_footer|<div\b[^>]*\bclass=["']btn|<\/fieldset>)/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalDetailUrl(rawHref: string): string {
  const url = new URL(decodeBasicEntities(rawHref).replace(/&amp;/g, "&"), BASE_URL + "/");
  const bk = url.searchParams.get("bk") ?? "";
  return `${BASE_URL}/user_sub?gfnc=www&pg=1&bk=${bk}&mu_idx=232&bt=rd&pgsize=10&bcd=press`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "g");

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1];
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const title = stripHtml(linkMatch[3]);
    const date = DATE_REGEX.exec(rowHtml)?.[1] ?? null;
    if (!title || !date) continue;

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: date,
      sourceUrl: canonicalDetailUrl(rawHref),
    });
  }

  return items;
}

export function parseDetailBody(html: string): string | null {
  const title = stripHtml(TITLE_REGEX.exec(html)?.[1] ?? "");
  const body = stripHtml(BODY_REGEX.exec(html)?.[1] ?? "");
  const date = DETAIL_DATE_REGEX.exec(html)?.[1];
  const text = [title, date ? `작성일 ${date}` : null, body].filter(Boolean).join("\n\n");
  return /[가-힣]/.test(text) && text.length >= 250 ? text.slice(0, 20000) : null;
}

export const { scrapeAndInsert: scrapeYangguAndInsert } = createPressCollector({
  cityName: "양구군",
  region: "강원",
  ministry: "강원특별자치도 양구군청",
  sourceOutlet: "강원특별자치도 양구군청",
  sourceCode: "local-press-yanggu",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
