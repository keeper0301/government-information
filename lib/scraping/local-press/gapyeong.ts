// ============================================================
// 경기도 가평군청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /portal/selectBbsNttList.do?bbsNo=127&key=787
// 목록: SI legacy bbs_default_list table with selectBbsNttView links
// 상세: td.board_text_td is often a thin daily-summary title; full text is in HWPX attachment
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchSiAttachBody } from "./_si_attach_helper";
import { parseSiNttBody } from "./_si_ntt_helper";

const BASE_URL = "https://gp.go.kr";
const BBS_NO = "127";
const KEY = "787";
const LIST_URL = `${BASE_URL}/portal/selectBbsNttList.do?bbsNo=${BBS_NO}&key=${KEY}`;
const DETAIL_BASE = `${BASE_URL}/portal/`;

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectBbsNttView\.do\?[^"']*\bbbsNo=127[^"']*\bnttNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*\balt\s*=\s*["']새글["'][^>]*>/gi, " ")
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
  return `${BASE_URL}/portal/selectBbsNttView.do?key=${KEY}&bbsNo=${BBS_NO}&nttNo=${nttNo}&searchCtgry=&searchCnd=all&searchKrwd=&pageIndex=1&integrDeptCode=`;
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

export async function parseDetailBody(html: string): Promise<string | null> {
  const visibleBody = parseSiNttBody(html);
  if (visibleBody) return visibleBody;
  return fetchSiAttachBody(html, DETAIL_BASE);
}

export const { scrapeAndInsert: scrapeGapyeongAndInsert } = createPressCollector({
  cityName: "가평군",
  region: "경기",
  ministry: "경기도 가평군청",
  sourceOutlet: "경기도 가평군청",
  sourceCode: "local-press-gapyeong",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
