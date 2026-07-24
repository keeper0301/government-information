// ============================================================
// 경기도 여주시청 보도자료 수집 (2026-07-24)
// ============================================================
// 공식 보도자료: /www/selectEminwonNewsList.do?key=422&pageUnit=10&pageIndex=1&searchCnd=all
// 목록: selectEminwonNewsView.do?news_epct_no=<id> table rows
// 상세: p-table 상세 + goDownLoad(...) HWPX 첨부 본문
// ============================================================

import {
  createPressCollector,
  decodeBasicEntities,
  type PressNewsItem,
} from "./_factory";
import { fetchEminwonGoDownloadAttachBody } from "./_si_attach_helper";

const BASE_URL = "https://www.yeoju.go.kr";
const LIST_URL = `${BASE_URL}/www/selectEminwonNewsList.do?key=422&pageUnit=10&pageIndex=1&searchCnd=all`;
const DETAIL_PATH = "/www/selectEminwonNewsView.do";
const KEY = "422";
const OFR_PAGE_SIZE = "10";

const ROW_REGEX = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']*selectEminwonNewsView\.do[^"']*\bnews_epct_no=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i;
const DATE_REGEX = /<td\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i;
const DETAIL_TITLE_REGEX = /<span\b[^>]*class\s*=\s*["'][^"']*\bp-table__subject_text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
const DETAIL_BODY_REGEX = /<td\b[^>]*class\s*=\s*["'][^"']*\bp-table__content\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i;

function stripHtml(rawHtml: string): string {
  return decodeBasicEntities(
    rawHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<span\b[^>]*class\s*=\s*["'][^"']*\bp-icon\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&middot;/g, "·")
      .replace(/&hellip;/g, "…")
      .replace(/&#39;|&#039;/g, "'")
      .replace(/\r/g, "\n"),
  )
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeDetailUrl(newsEpctNo: string): string {
  return `${BASE_URL}${DETAIL_PATH}?pageUnit=10&pageIndex=1&searchCnd=all&key=${KEY}&news_epct_no=${newsEpctNo}&ofr_pageSize=${OFR_PAGE_SIZE}`;
}

export function parseListPage(html: string): PressNewsItem[] {
  const items: PressNewsItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(ROW_REGEX.source, "gi");

  while ((match = re.exec(html)) !== null) {
    const rowHtml = match[1];
    const linkMatch = LINK_REGEX.exec(rowHtml);
    const date = DATE_REGEX.exec(rowHtml)?.[1];
    if (!linkMatch || !date) continue;

    const newsEpctNo = linkMatch[2];
    const title = stripHtml(linkMatch[3]);
    if (seen.has(newsEpctNo) || !title || title.length < 5 || !/[가-힣]/.test(title)) {
      continue;
    }

    seen.add(newsEpctNo);
    items.push({
      seq: newsEpctNo,
      title,
      publishedDate: date,
      sourceUrl: makeDetailUrl(newsEpctNo),
    });
  }

  return items;
}

export function parseVisibleDetailBody(html: string): string | null {
  const title = stripHtml(DETAIL_TITLE_REGEX.exec(html)?.[1] ?? "");
  const body = stripHtml(DETAIL_BODY_REGEX.exec(html)?.[1] ?? "");
  const text = [title, body].filter(Boolean).join("\n").trim();
  if (text.length < 250 || !/[가-힣]/.test(text)) return null;
  return text.slice(0, 20000);
}

export async function parseDetailBody(html: string): Promise<string | null> {
  const attach = await fetchEminwonGoDownloadAttachBody(html);
  if (attach) return attach;
  return parseVisibleDetailBody(html);
}

export const { scrapeAndInsert: scrapeYeojuAndInsert } = createPressCollector({
  cityName: "여주시",
  region: "경기",
  ministry: "경기도 여주시청",
  sourceOutlet: "경기도 여주시청",
  sourceCode: "local-press-yeoju",
  listUrl: LIST_URL,
  parseListItems: parseListPage,
  parseDetailBody,
});
