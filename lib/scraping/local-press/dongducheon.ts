// ============================================================
// 경기도 동두천시청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /ddc/selectBbsNttList.do?bbsNo=95&key=1914
// 목록: SI bbs_default list table with selectBbsNttView links
// 상세: SI bbs_default view table with td.bbs_content
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://www.ddc.go.kr";
const LIST_URL = `${BASE_URL}/ddc/selectBbsNttList.do?bbsNo=95&key=1914`;
const BBS_NO = "95";
const KEY = "1914";

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectBbsNttView\.do\?[^"']*\bbbsNo=95[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*data-cell-header\s*=\s*["']작성일\s*:\s*["'][^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/td>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(nttNo: string): string {
  return `${BASE_URL}/ddc/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${nttNo}&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(ROW_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const dateMatch = DATE_REGEX.exec(rowHtml);
    if (!linkMatch || !dateMatch) continue;

    const nttNo = linkMatch[2];
    const title = stripHtml(linkMatch[3]).replace(/\s*새글\s*$/, "").trim();
    if (seen.has(nttNo) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(nttNo);
    items.push({
      seq: nttNo,
      title,
      publishedDate: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      sourceUrl: makeDetailUrl(nttNo),
    });
  }

  return items;
}

export const parseDetailBody = parseSiNttBody;

export const { scrapeAndInsert: scrapeDongducheonAndInsert } = createPressCollector({
  cityName: "동두천시",
  region: "경기",
  ministry: "경기도 동두천시청",
  sourceOutlet: "경기도 동두천시청",
  sourceCode: "local-press-dongducheon",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
