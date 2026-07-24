// ============================================================
// 경기도 양평군청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /www/selectBbsNttList.do?bbsNo=2&key=1112
// 목록: SI p-table simple table with selectBbsNttView links
// 상세: SI p-table block with td.p-table__content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.yp21.go.kr";
const BBS_NO = "2";
const KEY = "1112";
const LIST_URL = `${BASE_URL}/www/selectBbsNttList.do?bbsNo=${BBS_NO}&key=${KEY}`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectBbsNttView\.do\?[^"']*\bbbsNo=2[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<time\b[^>]*datetime\s*=\s*["'](\d{4}-\d{2}-\d{2})["'][^>]*>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class\s*=\s*["'][^"']*\bp-icon__new\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
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
  return `${BASE_URL}/www/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${nttNo}&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const rowRe = new RegExp(ROW_REGEX.source, "gi");

  while ((match = rowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const dateMatch = DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const seq = linkMatch[2];
    const title = stripHtml(linkMatch[3]).replace(/\s*새글\s*$/, "").trim();
    if (seen.has(seq) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(seq);
    items.push({
      seq,
      title,
      publishedDate: dateMatch[1],
      sourceUrl: makeDetailUrl(seq),
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeYangpyeongAndInsert } = createPressCollector({
  cityName: "양평군",
  region: "경기",
  ministry: "경기도 양평군청",
  sourceOutlet: "경기도 양평군청",
  sourceCode: "local-press-yangpyeong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
