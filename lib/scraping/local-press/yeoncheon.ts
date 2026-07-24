// ============================================================
// 경기도 연천군청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?bbsNo=29&key=3398
// 목록: SI p-media gallery cards with selectBbsNttView links
// 상세: SI p-table block with td.bbs_content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.yeoncheon.go.kr";
const BBS_NO = "29";
const KEY = "3398";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=${BBS_NO}&key=${KEY}`;

const CARD_START_REGEX = /<li\b[^>]*\bclass\s*=\s*["'][^"']*\bp-media\b[^"']*["'][^>]*>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectBbsNttView\.do\?[^"']*\bbbsNo=29[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>/i;
const HEADING_REGEX = /<em\b[^>]*\bclass\s*=\s*["'][^"']*\bp-media__heading-text\b[^"']*["'][^>]*>([\s\S]*?)<\/em>/i;
const TIME_REGEX = /<time\b[^>]*\bdatetime\s*=\s*["'](\d{4}-\d{2}-\d{2})["'][^>]*>/i;
const DATE_FALLBACK_REGEX = /\b(\d{4})[.-](\d{2})[.-](\d{2})\b/;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bp-icon__new\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&hellip;/g, "…")
      .replace(/&middot;/g, "·")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDetailUrl(nttNo: string): string {
  // The live site returns 502 for some copied empty-query variants (`id=&...`).
  // Use the minimal canonical query that the same detail endpoint accepts.
  return `${BASE_URL}/www/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${nttNo}&pageIndex=1`;
}

function cardSlices(html: string): string[] {
  const starts = [...html.matchAll(CARD_START_REGEX)].map((m) => m.index ?? 0);
  return starts.map((start, idx) => html.slice(start, starts[idx + 1] ?? html.length));
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();

  for (const cardHtml of cardSlices(html)) {
    const linkMatch = LINK_REGEX.exec(cardHtml);
    if (!linkMatch) continue;
    const seq = linkMatch[2];
    if (seen.has(seq)) continue;

    const headingMatch = HEADING_REGEX.exec(cardHtml);
    const title = stripHtml(headingMatch?.[1] ?? "");
    const timeMatch = TIME_REGEX.exec(cardHtml);
    const fallbackDate = DATE_FALLBACK_REGEX.exec(cardHtml);
    const publishedDate = timeMatch?.[1] ?? (fallbackDate ? `${fallbackDate[1]}-${fallbackDate[2]}-${fallbackDate[3]}` : null);

    if (!title || title.length < 5 || !/[가-힣]/.test(title)) continue;
    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate,
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeYeoncheonAndInsert } = createPressCollector({
  cityName: "연천군",
  region: "경기",
  ministry: "경기도 연천군청",
  sourceOutlet: "경기도 연천군청",
  sourceCode: "local-press-yeoncheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
